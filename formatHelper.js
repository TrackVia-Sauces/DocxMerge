"use strict";
var dateFormat = require('dateformat');

class FormatHelper {

    constructor(){
        //no-op
        this.hi = "hi";
    }

    /**
     * get the current time
     * as a string
     */
    getCurrentDateTime(){
        var date = new Date();

        return dateFormat(date, "m-d-yyyy h.MM.sstt");

    }

    /**
     * Figures out the type for each field
     * @param {String} fieldName 
     * @param {Array} structure 
     */
    getStructureForField(fieldName, structure){
        
        var dataType;
        structure.forEach(function(fieldDef){
            if(fieldName === fieldDef.name){
                dataType = fieldDef.type;
            }
        });
        return dataType;
    }


    /**
     * Takes in a list of records and sanitize the field names.
     * Remove spaces, resoved punctuation and capitalizaion
     * @param {Array} recordList 
     */
    sanitizeData (recordList, structure){
        var returnList = [];
        var self = this;
        recordList.forEach(function(record){
            var sanitizedRecord = {};
            for(var field in record){
                var sanitizeField = field;
                sanitizeField = sanitizeField.replace(/\s+/g, '_');
                var value = record[field];
                var fieldType = self.getStructureForField(field, structure);
                value = self.formatValue(value, fieldType);
                sanitizedRecord[sanitizeField] = value;
            }
            returnList.push(sanitizedRecord);
        });

        return returnList;
    }

  
    /**
     * Correctly format data as the user expects it
     * @param {Object} value 
     * @param {String} fieldType 
     */
    formatValue(value, fieldType){
        if(!value){
            return "";
        }
        switch(fieldType){
            case "datetime":
                var date = new Date(value);
                return dateFormat(date, "m/d/yyyy h:MMtt");
            case "date":
                var parts = value.split('-'); //assuming YYYY-MM-DD
                return parts[1] + "/" + parts[2] + "/" + parts[0];
            case "currency":
                
                return "$" + this.numberWithCommas(Number(value).toFixed(2));
            case "percentage":
                var num = Number(value);
                num = (num * 100).toFixed(2) + "%";
                return num;
            default:
                return value;
        }
    }

    /**
     * Function I found on SO to create
     * currency formatting
     * @param {String} x 
     */
    numberWithCommas(x) {
        var parts = x.toString().split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return parts.join(".");
    }
}//end class

module.exports =  FormatHelper;

