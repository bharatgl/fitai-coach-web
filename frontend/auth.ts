import { MongoDBAdapter } from "@auth/mongodb-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getMongoClient } from "./lib/mongodb";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(getMongoClient, {
    databaseName: process.env.MONGODB_DB,
  }),
  providers: [Google],
  // Auth.js does not trust a local host header by default in every runtime.
  // Production remains explicitly opt-in through AUTH_TRUST_HOST.
  trustHost:
    process.env.AUTH_TRUST_HOST === "true" || process.env.NODE_ENV === "development",
  // Keep OAuth callback failures inside the product experience. Without this,
  // Auth.js sends users to its raw `/api/auth/error` configuration page.
  pages: { signIn: "/signin", error: "/signin" },
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
