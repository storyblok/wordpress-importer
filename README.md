# WordPress -> Storyblok Importer

This is a modified version of Storyblok's script to support
our use cases.

See [their original readme](README.storyblok.md) for more information.

## Setting up the migration plan

The migration plan controls which posts get migrated, and some of the ancillary information
for each post.

First of all, obtain the Migration Plan sheet.
Create a version of it that contains only the rows
of the articles you want to migrate.
It should have 4 columns, with no column headers:

- Current page
- Final URL destination
- Final URL title tag
- Final URL meta description

Download this as a CSV when you're done creating it.

## Running the migration with GitHub actions (recommended)

There is a GitHub action [defined here](./.github/workflows/migrate.yml) that can be used 
to run the migration easily.

All the information needed to run the action is stored in Secrets, which you can change from
Settings -> Security -> Secrets and variables -> Actions. The most likely information
you'll need to change is the `MIGRATION_PLAN_FILE_CONTENTS`, which (as you'd imagine) should
contain the file contents of the CSV you just downloaded.

To run it, go to Actions -> Migrate -> Run workflow.

## Running the migration locally (also an option)

You will need to have `nodenv` installed, or manually use the
Node.js version specified in [.node-version](.node-version).

Set a few things up:
```
npm install
cp .env.example .env
```

Now edit the [.env](.env) file so that the values are correct.
Editorial guidelines UUID is the UUID of the editorial guidelines
story in storyblok that will be linked to on each article.
(This one is not currently used but may be in the future.)

The migration is split into several steps.

### Getting the TablePress export

Run the script which uses Playwright to obtain the export from
the TablePress section of the WordPress Admin.
```
npm run fetch-tablepress-tables
```

### Fetching media info

WordPress keeps track of media items by ID, and this is the only
way to fetch them from the API. But the main part of the
migration script is looking only at the URLs. So we will 
pre-fetch information about the media, saving it as a JSON
file. The ones we need the 
most are alt text and title.

```
npm run fetch-media-json
```

### Main migration

Make sure the migration plan file is in this directory and
called `migration_plan.csv`

Then run the script.

```
npm run migrate
```
