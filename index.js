/**
 *
 * This sauce relies heavily on the docxtemplater by Edgar Hipp
 * https://github.com/open-xml-templating/docxtemplater
 * The orginal source was changed to allow new-line characters to work
 * as expected by our users.
 *
 * Grab the libraries we need to
 * merge docx files
 */
const util = require('util');
var JSZip = require('jszip');
var Docxtemplater = require('./docxtemplater/js/docxtemplater.js');
var fs = require('fs');
var path = require('path');
var TrackviaAPI = require('./api-src/trackvia-api.js');
var FormatHelper = require('./formatHelper.js');
var config = require('./config');
var log = require('./log');

//The ID of a record
const ID_FIELD = "id";

const RECORD_ID_FIELD = "Record ID";

const LAST_USER_ID_FIELD = "Last User(id)";
const TABLES = {
  MERGE: "MERGE",
  TEMPLATE: "TEMPLATE"
};

//The TrackVia api for interaction with the data
var api = new TrackviaAPI(config.account.api_key, config.account.environment);
var formatter = new FormatHelper();



/*****************************************************
 * The section below here is where all the code goes
 * that determines the out come of this microserivce.
 * This is the fun part
 *****************************************************/

/**
 * Used by our microservice infrastructure to
 * kick off all events
 */
exports.handler = function(event, context, callback) {
    //don't let the multi-threaded nature of things
    //cause the call back to not resolve immedietly.
    if(context){
        context.callbackWaitsForEmptyEventLoop = false;
    }
    log.log('starting');
    checkTemplateViewId(config.template_table.view_id);
    checkTemplateViewId(config.merged_doc_table.view_id);
    globalCallback = callback;

    //Check if we're doing this for a single record
    //or for lots of records
    if (!event.tableId) {
            log.error('No table ID. I am out');
            globalCallback(null, "There's no table ID, so I'm done");
    } else {
        //go get the records we need to merge
        getRecordsThatNeedToBeMerged(event.tableId);
    }
}


/**
 * This function gets a tableID, finds the viewID, if one exists
 * and then grabs all the records in that view to be merged
 * @param {Number} tableId
 */
function getRecordsThatNeedToBeMerged(tableId){
    //first figure out if we have a viewId associated
    //with this table Id
    var viewId = getViewForTable(tableId);
    log.log("ViewId is: " + viewId);
    //now login
    api.login(config.account.username, config.account.password)
    .then(() => {
        log.log('Logged In.');
        return api.getView(viewId, {"start": 0, "max": 1000})
    }).then((response) =>{
        var data = response.data;
        var structure = response.structure;
        log.log("Records found in view: " + data.length);
        resetSourceRecordLTP(viewId, data);

        //now figure out what templates are at play for which records
       getTemplates(viewId, data, structure);
    })
    .catch(function(err) {
       handleError(err);
    });
}

/**
 * Reset the LTP for the template in the source folders
 * @param {Number} viewId
 * @param {Array} records
 */
function resetSourceRecordLTP(viewId, records){
    var resetPromises = [];
    var templateRelationshipFieldName = config.source_tables.template_relationship_field_name;
    var data = {[templateRelationshipFieldName]:null};
    records.forEach(function(record){
        resetPromises.push(api.updateRecord(viewId, record[ID_FIELD], data));
    });
    //don't care about the response
    Promise.all(resetPromises)
    .then(()=>{
        log.log("Reset all source records");
    }).
    catch(function(err){
      //check for error code, if 401 then could be, wrong relation field name,
      log.error("Unable to unset relationship to template. Please ensure template relationship field name, \"" + config.source_tables.template_relationship_field_name + "\" matches relationship name on source table EXACTLY, and be sure that \"" + viewId + "\" is the correct view for sending merge data to templates.");
    });
}


/**
 * This function will grab all the template files
 * that are needed to satisfy the current requests
 * @param {map of data} data
 */
function getTemplates(viewId, data, structure){
    //now figure out what templates are at play for which records
    var templatesToRecords = getDistinctTemplateForRecords(data);
    //for each template create a promise and go get them all
    var promises = [];
    var templateIdsInOrder = [];
    for(id in templatesToRecords){
        templateIdsInOrder.push(id);
        promises.push(api.getFile(config.template_table.view_id, id, config.template_table.field_name_for_template_document));
    }
    Promise.all(promises)
    .then((templates) => {
        var templateIdToFiles = {};
        for(i in templateIdsInOrder){
            //get the file name if it's in there
            var fileName = templates[i].response.headers["content-disposition"];
            if(fileName.indexOf("filename=") > 0){
                var index = fileName.indexOf("filename=") + "filename=".length;
                fileName = fileName.substr(index);
            } else {
                fileName = "template.docx";
            }
            log.log("Template file name is " + fileName);
            file = templates[i].body;
            templateIdToFiles[templateIdsInOrder[i]] = {"file": file, "name": fileName};
        }
        //might need to write files to disk here? Not sure.
        var mergeData = mergeRecordsIntoTemplates(templatesToRecords, templateIdToFiles, structure)
        uploadMergeFiles(viewId, mergeData, templatesToRecords);
    }).catch(function(err) {
      checkFieldNames(TABLES.TEMPLATE, config.template_table.view_id);
    });
}

/**
 * Checks to make sure that the viewId is a number
 * @param {Number} viewId
 */
function checkTemplateViewId(viewId) {
  if (isNaN(parseInt(viewId)) || viewId <= 0) {
    log.error('Please ensure template view ids are numeric and greater than 0');
  }
  return viewId;
}

/**
 * This will take in a map of template IDs to the resultant merge files
 * and upload them in the appropriate place
 * @param {object} idsToMergeFiles
 */
function uploadMergeFiles(viewId, mergeData, templatesToRecords){
    var promises = [];
    for(id in mergeData){
        var templateMergeData = mergeData[id];
        var file = templateMergeData["file"];
        var recordIdList = templateMergeData["recordIds"];
        var userId = templateMergeData["userId"];

        var recordIdsStr = recordIdList.join("\n");
        var recordCount = templatesToRecords[id].length;
        var recordData = {};

        //if defined update the details
        if(config.merged_doc_table.merged_doc_details_field_name){
            recordData[config.merged_doc_table.merged_doc_details_field_name] = "Merged " + recordCount + " records:\n" + recordIdsStr;
        }

        //if defined set the relationship
        if(config.merged_doc_table.merged_doc_to_template_relationship_field_name){
            recordData[config.merged_doc_table.merged_doc_to_template_relationship_field_name] = id;
        }

        //if it's all configured, add the user who made the change
        if(config.merged_doc_table.merge_user_field_name && userId){
            recordData[config.merged_doc_table.merge_user_field_name] = userId;
        }
        promises.push(api.addRecord(config.merged_doc_table.view_id, recordData ));
    }
    Promise.all(promises)
    .then((newRecords) =>{
        var uploadPromises = [];
        var i = 0;
        for(id in mergeData){
            var templateMergeData = mergeData[id];
            var file = templateMergeData["file"];
            var recordId = newRecords[i].data[0][ID_FIELD];
            uploadPromises.push(api.attachFile(config.merged_doc_table.view_id, recordId, config.merged_doc_table.merged_document_field_name, file));
            i++;
        }
        return Promise.all(uploadPromises);
    })
    .then((uploadResponses) =>{
        log.log("done uploading everything");

        if(globalCallback){
            globalCallback(null, "Merge completed successfully");
        }
    })
    .catch(function(err) {
      checkFieldNames(TABLES.MERGE, config.merged_doc_table.view_id);
    });
}

/**
 * Function to determine what field is causing the upload error
 * @param {String} table
 * @param {Number} viewId
 */
function checkFieldNames(table, viewId) {
  api.getView(viewId)
  .then((view) => {
    let structure = createFieldsObject(view.structure);
    for (let field in config.export_fields[table]) {
      let fieldValue = config.export_fields[table][field];
      if (!fields[fieldValue]) {
        log.error(`Couldn't find the field \"${fieldValue}\" in the table \"${table}\". This value is set in config.js as the value for \"${field}\"`);
      }
    }
  })
  .catch((err) => {
    if(err.response_code == 401){
      log.error(`Could not find ${table} view, please check the view id: "${viewId}"`);
      return;
    }
    handleError(err);
  });
}

function createFieldsObject(structure) {
  fields = {};
  structure.forEach((field) => {
    fields[field.name] = true;
  });
  return fields;
}

/**
 * Helper function that loops over the function that does the real work
 * @param {*} templatesToRecords
 * @param {*} templateIdToFiles
 */
function mergeRecordsIntoTemplates(templatesToRecords, templateIdToFiles, structure){
    var idsToMergeFiles = {};
    for(var templateId in templateIdToFiles){
        var recordsWithSanitizedFieldNames = formatter.sanitizeData(templatesToRecords[templateId], structure);

        //get the user who last updated the source record
        var userId = getLastUpdatedUser(templatesToRecords[templateId]);
        //gets a list of record IDs for the notes
        var recordIds = getRecordIdsList(templatesToRecords[templateId]);
        var mergeFile = mergeRecordIntoTemplate(recordsWithSanitizedFieldNames, templateIdToFiles[templateId], templateId);
        idsToMergeFiles[templateId] = {"file": mergeFile, "recordIds": recordIds, "userId": userId};
    }

    return idsToMergeFiles;
}

/**
 * Gets the last user to update the record
 * @param {Map} recordList
 */
function getLastUpdatedUser(recordList){
    var userId = null;
    if(recordList.length > 0){
        userId = recordList[0][LAST_USER_ID_FIELD];
    }
    return userId;
}

/**
 * Creates a list of recordId values
 * @param {Map} recordList
 */
function getRecordIdsList(recordList){
    var list = [];
    recordList.forEach(function(record){
        var recordId = record[RECORD_ID_FIELD];
        if(recordId){
            list.push(recordId);
        }
    });
    return list;
}



/**
 * This function takes in the template
 * and the data from all the records
 * and then outputs a merged .docx file
 */
function mergeRecordIntoTemplate(records, template, templateId){
    log.log("In mergeRecordIntoTemplate");

    //Load the docx file as a binary
    var content = template.file;
    var fileName = template.name;
    var zip = new JSZip(content);
    var doc = new Docxtemplater();
    doc.loadZip(zip);
    //This bit of code here will make sure that variables in the template
    //that don't have corresponding values in the record data are
    //replaced with empty strings
    doc.setOptions({'nullGetter': function(part) {
            return "";
    }})


    log.log("Data to merge:");
    log.log(records);
    //create the data structure to merge into the template
    var mergeData = {"page":records};

    //set the templateVariables
    doc.setData(mergeData);

    try {
        // render the document (replace all occurences of {first_name} by John, {last_name} by Doe, ...)
        doc.render()
    }
    catch (err) {
        handleError(err);
    }

    var buf = doc.getZip().generate({type: 'nodebuffer'});

    // buf is a nodejs buffer, you can either write it to a file or do anything else with it.
    var filePath = "/tmp/" + templateId;
    if (!fs.existsSync(filePath)){
        fs.mkdirSync(filePath);
    }
    var currentTimeStr = formatter.getCurrentDateTime();
    filePath = filePath + "/" + currentTimeStr + "_" + fileName;
    fs.writeFileSync(filePath, buf);
    log.log("Wrote file to file systems: " + filePath);
    return filePath;
}


/**
 * Given the list of data figures out which templates
 * are needed and organizes the data by template
 * for easier merging
 * @param {list of TV record data} data
 */
function getDistinctTemplateForRecords(records, template){
    var templatesToRecords = {};
    records.forEach(function(record){
        var templateId = record[config.source_tables.template_relationship_field_name_id];
        if(templateId){
            if(!(templateId in templatesToRecords)){
                templatesToRecords[templateId] = [];
            }
            templatesToRecords[templateId].push(record);
        }
    });

    return templatesToRecords;
}


/**
 * A simple helper function to look up the
 * view ID and do some error handling
 * @param {Number} tableId
 */
function getViewForTable(tableId){
    //make sure we're using a string key
    tableId = tableId.toString();

    //check if the table is in our
    //map of tables to views
    if(!(tableId in config.source_tables.table_ids_to_view_ids)){
        var errorStr = "There's no entry in our map for table: " + tableId + ". End";
        handleError(errorStr);
        return;
    }

    //get the view ID
    return config.source_tables.table_ids_to_view_ids[tableId];
}


/**
 * All error handling goes here
 * @param {Object} err
 */
function handleError(err){
    let parsedError = {
      'status'  : err.statusCode,
      'href'    : err.request.href,
      'verb'    : err.request.method,
      'headers' : err.headers,
      'body'    : err.body
    }
    log.error(util.inspect(parsedError, {showHidden: false, depth: null}))
    if(globalCallback != null){
        globalCallback(null, err);
    }
}

exports.handler({"tableId":17}, null, null);
