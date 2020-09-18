const moment = require('moment');

module.exports = function(record, structure) {
    let formatted = {};
    for(let field in record) {
        // Field should not contain any whitespace or special characters
        let formattedField = field.replace(/\s+/g, '_').replace(/#|\"|\'|!|@|\$|%|\^|\(|\)|\*|=|\+|&*/g,'');
        // Determine type of field
        let type;
        for(let struct of structure) {
            if(field === struct.name) {
                type = struct.type;
                break;
            }
        }
        // Based on the type follow certain formatting rules
        let value;
        switch(type) {
            case 'date':
                value = moment(record[field]).format('MM/DD/YYYY');
                break;
            case 'datetime':
                value = moment(record[field]).format('MM/DD/YYYY h:mm:ss a');
                break;
            case 'currency':
                value = `$${record[field].toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
                break;
            case 'percentage':
                value = `${(parseFloat(record[field])*100)}%`;
                break;
            default:
                value = record[field];
                break;
        }
        formatted[formattedField] = value;
    }
    return formatted;
}
