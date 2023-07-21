# WordPress -> Storyblok Importer

This is a modified version of Storyblok's script to support
our use cases.

See [their original readme](README.storyblok.md) for more information.

You will need to have `nodenv` installed, or manually use the
Node.js version specified in [.node-version](.node-version).

Set a few things up:
```
npm install
cp .env.example .env
```

Now edit the [.env](.env) file so that the values are correct.
Don't worry about the tablepress export directory path since
we'll set that up soon.
Editorial guidelines UUID is the UUID of the editorial guidelines
story in storyblok that will be linked to on each article.

The migration is split into several steps.

## Getting the TablePress export

Go to our production WordPress admin -> TablePress -> Export.
Choose "Select all" and choose the JSON format. Download and 
extract the export file. Specify the location you extracted 
it in `TABLEPRESS_EXPORT_DIRECTORY_PATH` of the [.env](.env)
file.

## Fetching media info

WordPress keeps track of media items by ID, and this is the only
way to fetch them from the API. But the main part of the
migration script is looking only at the URLs. So we will 
pre-fetch information about the media, saving it as a JSON
file. The ones we need the 
most are alt text and title.

```
npm run fetch-media-json
```

## Main migration

First of all, obtain the Migration Plan sheet.
Create a version of it that contains only the rows
of the articles you want to migrate.
It should have 4 columns, with no column headers:

- Current page
- Final URL destination
- Final URL title tag
- Final URL meta description

Export this as a CSV, to a file in this directory
called `migration_plan.csv`

Then run the script.

```
npm run migrate
```
