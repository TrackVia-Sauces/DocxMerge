const constants = require('../constants');
const fs = require('fs');

const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const ImageModule = require('open-docxtemplater-image-module');

module.exports = async function(record, template, filename) {
    // The following is straight from the image module docs
    var opts = {}
    opts.centered = false;
    opts.fileType = "docx";
    opts.getImage = function(tagValue, tagName) {
        const base64Regex = /^data:image\/(png|jpg|svg|svg\+xml);base64,/;
        if (!base64Regex.test(tagValue)) {
            return false;
        }
        const stringBase64 = tagValue.replace(base64Regex, "");
        let binaryString;
        binaryString = Buffer.from(stringBase64, "base64").toString("binary");
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            const ascii = binaryString.charCodeAt(i);
            bytes[i] = ascii;
        }
        return bytes.buffer;
    }
    opts.getSize = function(img, tagValue, tagName) {
        if(constants.imageSize.width === 0 &&
            constants.imageSize.height === 0) {
                var sizeOf = require("image-size");
                let sizeObj = sizeOf(Buffer.from(img, "binary"));
                return [sizeObj.width, sizeObj.height];
        } else {
            return [constants.imageSize.width, constants.imageSize.height];
        }
    }
    const imageModule = new ImageModule(opts);

    // Create a zip of the file contents
    const zip = new PizZip(template.contents);

    // Create a templater instance and load the contents
    var doc = new Docxtemplater();
    // Necessary so empty fields dont display undefined
    doc.setOptions({'nullGetter': function(part) {
        return "";
    }})
    doc.attachModule(imageModule);
    doc.loadZip(zip);

    // Set the data used in the template
    doc.setData(record);

    // Render the document
    doc.render();
    
    // Return buffer of rendered document
    const buf = doc.getZip().generate({type: 'nodebuffer'});

    // Write the buffer to disk for use later
    fs.writeFileSync(`/tmp/${filename}`, buf);
}
