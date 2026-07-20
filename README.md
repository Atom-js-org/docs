# AtomJS Docs

פרויקט תיעוד סטטי המבוסס על **HTML + CSS + JavaScript**, כאשר מבנה האתר מגיע מ־`docs.json` והתוכן נטען מקובצי `.mdx` שבתיקיית `docs/`.

## הפעלה

נדרש Node.js 18 ומעלה. אין צורך להתקין חבילות:

```bash
npm start
```

לאחר מכן פותחים בדפדפן:

```text
http://localhost:4173
```

> פתיחה ישירה של `index.html` דרך `file://` לא תאפשר לדפדפן לטעון את `docs.json` וקובצי ה־MDX. לכן מצורף שרת סטטי קטן ללא תלויות.

## מבנה הפרויקט

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

## הוספת עמוד

1. יוצרים קובץ MDX חדש בתוך `docs/`.
2. מוסיפים אותו ל־`docs.json` עם `title`, `slug`, `file`, `description` ו־`updated`.
3. הקישור יופיע אוטומטית בסרגל הצד ובחיפוש.

דוגמה:

```json
{
  "title": "New Page",
  "slug": "guides/new-page",
  "file": "guides/new-page.mdx",
  "description": "A short description.",
  "updated": "July 2026"
}
```

## רכיבי MDX נתמכים

בנוסף ל־Markdown רגיל, מנוע התצוגה כולל רכיבים קטנים:

```mdx
<Callout type="warning" title="Important">
Your message goes here.
</Callout>
```

הערכים הנתמכים עבור `type` הם `info`, `warning` ו־`success`.

```mdx
<FeatureGrid>
  <Feature title="Fast" href="#section">A short description.</Feature>
  <Feature title="Flexible" href="#section">Another description.</Feature>
</FeatureGrid>
```

## ערכת נושא

ברירת המחדל היא `system`. בחירה ידנית ב־Light או Dark נשמרת ב־`localStorage` תחת המפתח `atomjs-theme`.
