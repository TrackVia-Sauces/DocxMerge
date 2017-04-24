# DocxMerge
Merges records from the same table into one .docx file using a .docx template.

This sauce assumes you have the following setup
* A table with a document field that holds the templates for your doc merges. We'll call this the template table. This is where the sauce will find the templates. If you want to change a template you just need to re-upload a new template file. If you want to use multiple templates, simply create multiple records in this table
* A table with a document field that holds the merged .docx file. We'll call this the merged doc table. After a successful merge a new record will be created in this table and the merged file will be uploaded to it in a document field. This table should also contain a relationship to the template table, so you know where the merged doc came from, and a short answer field for some simple notes about the merge.
* Any table that you want to merge records from should have a relationship to the template table so you can select which template you want to use.
* For each table that has records that need to be merged setup a filetered view that only shows records who have a parent template set. This will be the view the sacue will look in to find the records it needs to merge.

## Configuration
The following section of the [index.js](https://github.com/TrackVia-Sauces/DocxMerge/blob/master/index.js) file needs to changed to reflect your account:
```

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
```
## .docx Templates
The [template file include](https://github.com/TrackVia-Sauces/DocxMerge/blob/master/template_example.docx) shows how to use curly braces `{}` to add variables to your .docx file that will be replaced by values from your TrackVia records.

* Keep in mind that the document must have a page start tag `{#page}` and a page close tag `{/page}` on another page for paging to work.
* If the names in your records have spaces replace them with underscores. For example a field called "first name" would be written as `{first_name}` in the template.
