#!/usr/bin/env node

// Quick helper to print all property IDs for one or more Notion databases.
// Usage:
//   node scripts/print-db-props.js <DATABASE_ID> [<DATABASE_ID> ...]
// or, with env fallbacks:
//   COMMANDS_DB_ID=... DISPATCH_CONFIG_DB_ID=... node scripts/print-db-props.js

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dotenv = require("dotenv");
dotenv.config();

const token = process.env.NOTION_TOKEN;
const notionVersion = process.env.NOTION_VERSION || "2022-06-28";

if (!token) {
  console.error("Missing NOTION_TOKEN in environment");
  process.exit(1);
}

let dbIds = process.argv.slice(2).filter(Boolean);

if (dbIds.length === 0) {
  const envIds = [
    process.env.COMMANDS_DB_ID,
    process.env.DISPATCH_CONFIG_DB_ID,
    process.env.OBJECTIVES_DB_ID,
  ].filter(Boolean);
  dbIds = envIds;
}

if (dbIds.length === 0) {
  console.error(
    "Usage: node scripts/print-db-props.js <DATABASE_ID> [<DATABASE_ID> ...]\n" +
      "Or set COMMANDS_DB_ID / DISPATCH_CONFIG_DB_ID / OBJECTIVES_DB_ID in your .env and run without args.",
  );
  process.exit(1);
}

async function fetchDatabase(dbId) {
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": notionVersion,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`\nFailed to fetch database ${dbId}: ${res.status} ${text}`);
    return;
  }

  const data = await res.json();
  const title =
    (Array.isArray(data.title) && data.title[0] && (data.title[0].plain_text || data.title[0].text?.content)) ||
    "";

  console.log(`\n=== Database ${dbId} ===`);
  if (title) {
    console.log(`Title: ${title}`);
  }

  const props = data.properties || {};
  for (const [name, prop] of Object.entries(props)) {
    console.log(`- ${name}: id=${prop.id}, type=${prop.type}`);
  }
}

async function main() {
  for (const id of dbIds) {
    // eslint-disable-next-line no-await-in-loop
    await fetchDatabase(id);
  }
}

main().catch((err) => {
  console.error("Unexpected error in print-db-props:", err);
  process.exit(1);
});


