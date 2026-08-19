import { MongoDBAdapter } from "@auth/mongodb-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getMongoClient } from "./lib/mongodb";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(getMongoClient, {
    databaseName: process.env.MONGODB_DB,
  }),
  providers: [Google],
  pages: { signIn: "/signin" },
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
