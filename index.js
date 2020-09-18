const constants = require('./constants');
const TrackviaAPI = require('trackvia-api');

const generateDocument = require('./services/generateDocument');
const formatRecord = require('./services/formatRecord');

exports.handler = async function(event, context, callback) {
    context.callbackWaitsForEmptyEventLoop = false;
    console.log('EVENT:', event);

    const api = new TrackviaAPI(constants.key, constants.token, constants.host);

    //@TODO: maybe the view should contain unique template IDs
    // Fetch the records that were moved into the merging view
    let records;
    try {
        records = await api.getView(constants.mergingViewId);
    } catch (err) {
        console.log('COULD NOT FETCH RECORDS:', err);
        callback(err);
    }

    // If there are no records in the view return
    if(records.totalCount === 0) {
        callback(null, 'No records to merge');
        return;
    }

    // Identify any image fields that need to be fetched
    let imageFields = [];
    for(let field of records.structure) {
        if(field.type === 'image') {
            imageFields.push(field.name);
        }
    }

    // Get each image field on every record
    for(let record of records.data) {
        for(let field of imageFields) {
            try {
                // load the images in a series because API returns 404 if field is empty
                const image = await api.getFile(constants.mergingViewId, record.id, field);
                // Extract the image type from the reponse header
                const type = image.response.headers['content-disposition'].match(/"(.*)"/).pop().split('.')[1];
                const contents = image.body;
                // Convert file contents to base64 string for transport
                const imageB64 = `data:image/${type};base64,${Buffer.from(contents, 'binary').toString('base64')}`;
                // Finally attach converted image to record
                record[field] = imageB64;
            } catch(err) {
                // In case of an image field being outside of a view or the image being absent on the record
                if(err.statusCode === 404) {
                    continue;
                } else {
                    console.log("COULD NOT FETCH IMAGES FOR RECORD:", err);
                    callback(err);
                }
            }
        }
    }

     //@TODO: maybe the reset should happen in parallel
    // Reset the records now that they have been extracted from the view
    for(let record of records.data) {
        // Define the object that actually nullifys the relationship
        reset = {};
        reset[constants.recordLinkToTemplateField] = null;
        try {
            await api.updateRecord(constants.mergingViewId, record.id, reset);
        } catch (err) {
            console.log('COULD NOT RESET LINK TO TEMPLATE:', err);
            callback(err);
        }
    }

    // Create a map of templates to merge with
    let templateMap = {};
    for(let record of records.data) {
        // Parse the template ID to merge into
        const templateId = record[`${constants.recordLinkToTemplateField}(id)`];
        if(!templateMap[templateId]) {
            // Fetch the new template
            let template;
            try {
                template = await api.getFile(constants.templateViewId, templateId, constants.templateDocumentField);
            } catch (err) {
                console.log('COUND NOT FETCH TEMPLATE:', err);
                callback(err);
            }
            // Body contains the raw file contents
            const contents = template.body;
            // Extract the original file name from the header
            const name = template.response.headers['content-disposition'].match(/"(.*)"/).pop();
            // Put response into template map
            templateMap[templateId] = {
                contents: contents,
                name: name
            };
        }
    }

    // Generate a document for each record
    for(let record of records.data) {
        // Transform record into correct template format
        let formatted;
        try {
            formatted = formatRecord(record, records.structure);
        } catch (err) {
            console.log('COULD NOT FORMAT RECORD:', err);
            callback(err);
        }
        // Hang on to the template ID
        const templateId = record[`${constants.recordLinkToTemplateField}(id)`];
        // Let the service generate a document
        try {
            await generateDocument(formatted, templateMap[templateId], constants.destinationDocumentName);
        } catch (err) {
            console.log('COULD NOT GENERATE DOCUMENT:', err);
            callback(err);
        }
        // Create a record to hold the generated document
        let destination;
        try {
            // Set the relationships on the destination table for the new record
            let data = {};
            data[constants.destinationLinkToTemplateField] = templateId;
            data[constants.destinationLinkToRecordField] = record.id;

            destination = await api.addRecord(constants.destinationViewId, data);
        } catch (err) {
            console.log('COULD NOT GENERATE DESTINATION RECORD:', err);
            callback(err);
        }
        // Attach finished document to newly created file
        try {
            await api.attachFile(constants.destinationViewId, destination.data[0].id, constants.destinationDocumentField, `/tmp/${constants.destinationDocumentName}`);
        } catch (err) {
            console.log('COULD NOT ATTACH GENERATED DOCUMENT:', err);
            callback(err);
        }
        
    }

    callback(null, 'success');
};