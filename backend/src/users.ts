import type { AuthenticatedUser } from "./auth.js";
import { getDatabase } from "./db.js";

export async function syncAuthenticatedUser(user: AuthenticatedUser) {
  const database = await getDatabase();
  const now = new Date();

  await database.collection("appUsers").updateOne(
    { externalId: user.id },
    {
      $set: {
        email: user.email,
        displayName: user.name,
        updatedAt: now,
      },
      $setOnInsert: {
        externalId: user.id,
        createdAt: now,
      },
    },
    { upsert: true },
  );
}
