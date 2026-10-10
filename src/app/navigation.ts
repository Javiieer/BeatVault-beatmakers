import { modules } from "./modules";

export const nav = modules.filter(item => item.navigation === "primary");
export const secondary = modules.filter(item => item.navigation === "admin");
