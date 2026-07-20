# AtomJS Docs

A static documentation project built with **HTML + CSS + JavaScript**. The site structure is defined in `docs.json`, while the content is loaded from `.mdx` files located in the `docs/` directory.

## Running the Project

Node.js 18 or later is required. No package installation is needed:

```bash
npm start
```

Then open the following URL in your browser:

```text
http://localhost:4173
```

> Opening `index.html` directly through `file://` will prevent the browser from loading `docs.json` and the MDX files. For this reason, the project includes a small dependency-free static server.

## Project Structure

```text
atomjs-docs/
├── index.html
├── docs.json
├── docs.schema.json
├── docs/
│   ├── getting-started.mdx
│   ├── configuration/
│   ├── guides/
│   └── advanced/
├── assets/
│   ├── app.js
│   ├── styles.css
│   └── logo.svg
├── serve.mjs
└── package.json
```

## Adding a Page

1. Create a new MDX file inside the `docs/` directory.
2. Add it to `docs.json` with the `title`, `slug`, `file`, `description`, and `updated` fields.
3. The link will automatically appear in the sidebar and search results.

Example:

```json
{
  "title": "New Page",
  "slug": "guides/new-page",
  "file": "guides/new-page.mdx",
  "description": "A short description.",
  "updated": "July 2026"
}
```

## Supported MDX Components

In addition to standard Markdown, the rendering engine includes several small components:

```mdx
<Callout type="warning" title="Important">
Your message goes here.
</Callout>
```

The supported values for `type` are `info`, `warning`, and `success`.

```mdx
<FeatureGrid>
  <Feature title="Fast" href="#section">A short description.</Feature>
  <Feature title="Flexible" href="#section">Another description.</Feature>
</FeatureGrid>
```

## Theme

The default theme is `system`. A manual selection of Light or Dark mode is saved in `localStorage` under the `atomjs-theme` key.
