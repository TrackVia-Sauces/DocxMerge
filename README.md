# DocxMerge
Merges records from the same table into a .docx file using a .docx template.

This sauce requires that you have the following TrackVia ERD
* A table with a document field that will hold the templates for your .docx merges. We will refer to this as the `Template` table. If you want to change a template, you need to upload a new template file. If you want to use multiple templates, create multiple records in this table.

* A table with a document field that will hold the merged .docx file. We will refer to this as the `Destination` table. After a successful merge a new record will be created in this table and the merged file will be uploaded to it.

* A table that holds the records which you would like to merge into .docx files. We will refer to this as the `Records` table.

* A view that is filtered to contain the records that have a template relationship set.  The sauce pulls records from this view.  The filter should check that the relationship to the `Template` table is not blank.

Here is an example of the required ERD for an app that has been setup to perform .docx merge on a table called *Records*. The .docx templates are stored in the table called *Templates* and the resulting documents are stored in *Destination*.

![alt text](https://raw.githubusercontent.com/TrackVia-Sauces/DocxMerge/master/images/exampleERD.png "Example ERD")


## Installation
Download or clone this repository and run `npm install` to install all the packages needed to run this sauce.

## Configuration
First copy `constants.template.js` as `constants.js` and then change `constants.js` to match the details of your account.

Once you've configured your `constants.js` file, zip the files, and use the zip file as your source for configuring the TrackVia microservice.

Attach the .docx merge microservice to the `Records` table on the `After Update` event.

## .docx Templates
The [template file included](https://github.com/TrackVia-Sauces/DocxMerge/blob/master/template/template.docx) shows how to use curly braces `{}` to add variables to your .docx file that will be replaced by values from your TrackVia records.

* If the field names in your records have spaces replace them with underscores. For example a field called `First Name` would be written as `{First_Name}` in the template.
* Field names are case sensitive. If your field in TrackVia is `First name` then you must call it `{First_name}` in the template file.
* Field names cannot have special characters. For example you cannot use `{#_of_days}`. The sauce will remove `#, ", ', !, @, $, %, ^, (, ), *, =, +, &` from field names. For instance, if you have a field called "cash$" you can refer to it as `{cash}` in the template.
