/**
 * Grab the libraries we need to 
 * merge docx files
 */
var JSZip = require('jszip');
var Docxtemplater = require('docxtemplater');
var fs = require('fs');
var path = require('path');
var TrackviaAPI = require('trackvia-api');
var FormatHelper = require('./formatHelper.js');

/**
 * Constants and global variables needed
 * to make this all work
 */

//The API key that gives you access to the API
//This is found at https://go.trackvia.com/#/my-info
const API_KEY = '12345777';

//The name of the user to login as
const USERNAME = 'user@user.com';

//The password of the user to login as
const PASSWORD = 'correcthorsebatterystaple';

//The address of the server you'll be using
const PRODUCTION_SERVER = 'https://go.trackvia.com';

//The ID of a record
const ID_FIELD = "id";

/************************* Template Table *********************************/
//The view ID we'll use to find the template files
const TEMPLATE_VIEW_ID = 67;

//The name of the field in the template view that holds the docx file
const TEMPLATE_FIELD_NAME = "Template";

/************************* Merged Doc Table *********************************/
//The view ID we'll use to place the merged doc files
const MERGED_DOC_VIEW_ID = 68;

//The name of the field in the merged doc view that holds the docx file
const MERGED_DOC_FIELD_NAME = "Doc";

//The name of the field where we'll put the details of the doc merge
const MERGED_DOC_DESCRITION_FIELD_NAME = "Details";

//The name of the field in the merged doc table that links to the template
const MERGED_DOC_TEMPLATE_FIELD_NAME = "Template";
const MERGED_DOC_TEMPLATE_FIELD_NAME_ID = MERGED_DOC_TEMPLATE_FIELD_NAME + "(id)";


/************************* Source Record Tables *********************************/
//The name of the field on ANY RECORD THAT NEEDS TO BE MERGED
//that tells us which template to use
//this needs to be the same across all tables that will
//have their records merged
const SOURCE_RECORD_TEMPLATE_FIELD_NAME = "Merge Template";
const SOURCE_RECORD_TEMPLATE_FIELD_NAME_ID = SOURCE_RECORD_TEMPLATE_FIELD_NAME + "(id)";

//This one is a big complex but necesary
//For reaons I won't go into here we need to know
//what view to look into for records that need to be merged
//when an event fires on a given table. So we need a map
//that connects table IDs to view IDs
const TABLE_TO_VIEW_MAP = {
                                "52" : 70
                            };

//The TrackVia api for interaction with the data
var api = new TrackviaAPI(API_KEY, PRODUCTION_SERVER);
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
    console.log('---  starting  ---');
    globalCallback = callback;
    

    //Check if we're doing this for a single record
    //or for lots of records
    if (!event.tableId) {
            console.log('---  No table ID. I am out  ---');
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
    console.log("ViewId is: " + viewId);

    //now login
    api.login(USERNAME, PASSWORD)
    .then(() => {
        console.log('Logged In.');
        return api.getView(viewId, {"start": 0, "max": 1000})
    }).then((response) =>{
        var data = response.data;
        var structure = response.structure;
        console.log("Records found in view: " + data.length);
        resetSourceRecordLTP(viewId, data)

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
    var data = {[SOURCE_RECORD_TEMPLATE_FIELD_NAME]:null};
    records.forEach(function(record){
        resetPromises.push(api.updateRecord(viewId, record[ID_FIELD], data));
    });
    //don't care about the response
    Promise.all(resetPromises)
    .then(()=>{
        console.log("Reset all source records");
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
        promises.push(api.getFile(TEMPLATE_VIEW_ID, id, TEMPLATE_FIELD_NAME));
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
            console.log("Template file name is " + fileName);
            file = templates[i].body;
            templateIdToFiles[templateIdsInOrder[i]] = {"file": file, "name": fileName};
        }
        //might need to write files to disk here? Not sure.
        var idsToMergeFiles = mergeRecordsIntoTemplates(templatesToRecords, templateIdToFiles, structure)
        uploadMergeFiles(viewId, idsToMergeFiles, templatesToRecords);
    }).catch(function(err) {
       handleError(err);
    });
}

/**
 * This will take in a map of template IDs to the resultant merge files
 * and upload them in the appropriate place
 * @param {object} idsToMergeFiles 
 */
function uploadMergeFiles(viewId, idsToMergeFiles, templatesToRecords){
    var promises = [];
    for(id in idsToMergeFiles){
        var file = idsToMergeFiles[id];
        var recordCount = templatesToRecords[id].length;
        var recordData = {
                            [MERGED_DOC_DESCRITION_FIELD_NAME]: "Merged " + recordCount + " records from view: " + viewId,
                             [MERGED_DOC_TEMPLATE_FIELD_NAME]: id
                        };
        promises.push(api.addRecord(MERGED_DOC_VIEW_ID, recordData));
    }
    Promise.all(promises)
    .then((newRecords) =>{
        var uploadPromises = [];
        var i = 0;
        for(id in idsToMergeFiles){
            var file = idsToMergeFiles[id];
            var recordId = newRecords[i].data[0][ID_FIELD];
            uploadPromises.push(api.attachFile(MERGED_DOC_VIEW_ID, recordId, MERGED_DOC_FIELD_NAME, file));
            i++;
        }
        return Promise.all(uploadPromises);
    })
    .then((uploadResponses) =>{
        console.log("done uploading everything");
    })
    .catch(function(err) {
        handleError(err);
    });
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
        var mergeFile = mergeRecordIntoTemplate(recordsWithSanitizedFieldNames, templateIdToFiles[templateId], templateId);
        idsToMergeFiles[templateId] = mergeFile;
    }

    return idsToMergeFiles;
}




/**
 * This function takes in the template
 * and the data from all the records
 * and then outputs a merged .docx file
 */
function mergeRecordIntoTemplate(records, template, templateId){
    console.log("In mergeRecordIntoTemplate");

    //Load the docx file as a binary
    var content = template.file;
    var fileName = template.name;
    var zip = new JSZip(content);
    var doc = new Docxtemplater();
    doc.loadZip(zip);
    doc.setOptions({'nullGetter': function(part) {
            if (!part.module) {
                    return "";
            }
            if (part.module === "rawxml") {
                    return "";
            }
            return "";
    }})


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
    console.log("Wrote file to file systems: " + filePath);
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
        var templateId = record[SOURCE_RECORD_TEMPLATE_FIELD_NAME_ID];
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
    tableId = tableId + "";

    //check if the table is in our
    //map of tables to views
    if(!(tableId in TABLE_TO_VIEW_MAP)){
        var errorStr = "There's no entry in our map for table: " + tableId + ". End";
        handleError(errorStr);
        return;
    }

    //get the view ID
    return TABLE_TO_VIEW_MAP[tableId];
}


/**
 * All error handling goes here
 * @param {Object} err 
 */
function handleError(err){
    console.log("We had an error:");
    console.log(err);
    if(globalCallback != null){
        globalCallback(null, err);
    }
}
