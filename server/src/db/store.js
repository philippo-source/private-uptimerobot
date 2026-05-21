import { config } from "../config.js";
import { mongoStore } from "./mongoStore.js";
import { postgresStore } from "./postgresStore.js";

export const store = config.dbProvider === "mongodb" ? mongoStore : postgresStore;

export async function initStore() {
  if (typeof store.init === "function") {
    await store.init();
  }
}
