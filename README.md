# DocxMerge
Merges records from the same table into one .docx file using a .docx template.

This sauce assumes you have the following setup
* A table with a document field that holds the templates for your doc merges. We'll call this the template table. This is where the sauce will find the templates. If you want to change a template you just need to re-upload a new template file. If you want to use multiple templates, simply create multiple records in this table.
* A table with a document field that holds the merged .docx file. We'll call this the merged doc table. After a successful merge a new record will be created in this table and the merged file will be uploaded to it in a document field. This table should also contain a relationship to the template table, so you know where the merged doc came from, and a short answer field for some simple notes about the merge.
* Any table that you want to merge records from should have a relationship to the template table, so you can select which template you want to use.
* For each table that has records that need to be merged, create a filetered view that only shows records who have a parent template set. This will be the view the sauce will look in to find the records it needs to merge.

## Installation
Download or clone this repository and run `npm install` to install all the node modules needed to run this sauce

## Configuration
First copy the [config.template.js file](https://github.com/TrackVia-Sauces/DocxMerge/blob/master/config.template.js) as `config.js` and then change the following in `config.js` to match the details of your account:
```
/************************* Account Config *********************************/
//The API key that gives you access to the API
//This is found at https://go.trackvia.com/#/my-info
config.account.api_key = '8675309';

//The name of the user to login as
config.account.username = 'user@user.com';

//The password of the user to login as
config.account.password = 'correcthorsebatterystaple';

//The address of the server you'll be using
config.account.environment = 'https://go.trackvia.com';

/************************* Template Table *********************************/
//The view ID we'll use to find the template files
config.template_table.view_id = 1;

//The name of the field in the template view that holds the docx file
config.template_table.field_name_for_template_document = "Template";

/************************* Merged Doc Table *********************************/
//The view ID we'll use to place the merged doc files
config.merged_doc_table.view_id = 2;

//The name of the field in the merged doc view that holds the docx file
config.merged_doc_table.merged_document_field_name = "Doc";

//The name of the field where we'll put the details of the doc merge
config.merged_doc_table.merged_doc_details_field_name = "Details";

//The name of the field in the merged doc table that links to the template
config.merged_doc_table.merged_doc_to_template_relationship_field_name = "Template";
//This config does not need to be edited. It'll modify the field name above to point 
//to the numeric ID of the relationship
config.merged_doc_table.merged_doc_to_template_relationship_field_name_id = config.merged_doc_table.merged_doc_to_template_relationship_field_name + "(id)";

/************************* Source Record Tables *********************************/
//The name of the field on ANY RECORD THAT NEEDS TO BE MERGED
//that tells us which template to use
//this needs to be the same across all tables that will
//have their records merged
config.source_tables.template_relationship_field_name = "Merge Template";
//This config does not need to be edited. It'll modify the field name above to point 
//to the numeric ID of the relationship
config.source_tables.template_relationship_field_name_id = config.source_tables.template_relationship_field_name + "(id)";

//This one is a big complex but necesary
//For reaons I won't go into here we need to know
//what view to look into for records that need to be merged
//when an event fires on a given table. So we need a map
//that connects table IDs to view IDs
config.source_tables.table_ids_to_view_ids = {
                                "3" : 4
                            };
```
## .docx Templates
The [template file included](https://github.com/TrackVia-Sauces/DocxMerge/blob/master/template_example.docx) shows how to use curly braces `{}` to add variables to your .docx file that will be replaced by values from your TrackVia records.

* Keep in mind that the document must have a page start tag `{#page}` and a page close tag `{/page}` on another page for paging to work.
* If the names in your records have spaces replace them with underscores. For example a field called "first name" would be written as `{first_name}` in the template.
* Field names are cas sensative. If your field in TrackVia is "First name" then you must call it '{First_name}' in the template file.
