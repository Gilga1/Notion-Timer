import { Client } from "@notionhq/client";

async function check() {
  const token = process.env.NOTION_TOKEN;
  if (!token) return;
  const notion = new Client({ auth: token });
  try {
    const response = await notion.search({});
    console.log("Databases accessible to integration:");
    for (const db of response.results as any[]) {
      if (db.object === 'database') {
        const title = db.title?.[0]?.plain_text || "Untitled";
        console.log(`- ${title} (ID: ${db.id})`);
        if (title.includes("Habit") || title.includes("Tracker") || title.includes("2026")) {
          console.log("  Properties:");
          for (const [name, prop] of Object.entries(db.properties || {})) {
            console.log(`    - ${name} (${(prop as any).type})`);
          }
        }
      }
    }
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

check();
