import { prisma } from "../src/config/prisma.js";
import { qdrant } from "../src/config/qdrant.js";
import { config } from "../src/config/env.js";
import { embedText } from "../src/services/rag/embedding.service.js";

const PROJECT_DB = String(process.env.PROJECT_DB_NAME || "dwira").trim();

function textForEmbedding(row) {
  return [
    `title: ${row.titre || ""}`,
    `type: ${row.type || ""}`,
    `location: ${row.location_name || ""}`,
    `description: ${row.description || ""}`,
    `features: ${row.features_text || ""}`,
    `price: ${row.price_per_night || ""} TND`,
  ].join("\n");
}

async function ensureCollection(vectorSize) {
  const name = config.qdrantPropertyCollection;
  try {
    await qdrant.getCollection(name);
  } catch {
    await qdrant.createCollection(name, {
      vectors: { size: vectorSize, distance: "Cosine" },
    });
  }
}

async function main() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      b.id, b.titre, b.type, b.description,
      COALESCE(z.nom, b.terrain_zone, '') AS location_name,
      COALESCE(b.prix_affiche_client, b.prix_nuitee) AS price_per_night,
      CONCAT_WS(' ',
        b.titre, b.description,
        CASE WHEN b.vue_mer = 1 THEN 'vue mer' ELSE '' END,
        CASE WHEN b.proche_plage = 1 THEN 'proche plage' ELSE '' END,
        CASE WHEN b.place_parking = 1 THEN 'parking' ELSE '' END
      ) AS features_text
    FROM ${PROJECT_DB}.biens b
    LEFT JOIN ${PROJECT_DB}.zones z ON z.id = b.zone_id
    WHERE b.mode = 'location_saisonniere' AND b.statut = 'disponible'
    LIMIT 3000
  `);

  if (!rows.length) {
    console.log("No properties to index.");
    return;
  }

  const firstVector = await embedText(textForEmbedding(rows[0]));
  await ensureCollection(firstVector.length);

  const points = [];
  let pointSeq = 1;
  for (const row of rows) {
    const vector = await embedText(textForEmbedding(row));
    points.push({
      // Qdrant point IDs must be uint64 or UUID. Keep source ID in payload.
      id: pointSeq++,
      vector,
      payload: {
        bien_id: String(row.id),
        title: String(row.titre || ""),
        type: String(row.type || ""),
        location: String(row.location_name || ""),
        price_per_night: Number(row.price_per_night || 0),
        text: textForEmbedding(row),
      },
    });
    if (points.length >= 64) {
      await qdrant.upsert(config.qdrantPropertyCollection, { wait: true, points: points.splice(0, points.length) });
    }
  }
  if (points.length) {
    await qdrant.upsert(config.qdrantPropertyCollection, { wait: true, points });
  }
  console.log(`Indexed ${rows.length} properties into ${config.qdrantPropertyCollection}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
