declare namespace Cloudflare {
  interface Env {
    ADMIN_EMAIL: string;
    CATALOG_SYNC_SECRET?: string;
    DB: D1Database;
    BUCKET: R2Bucket;
  }
}

declare module "*.html?raw" {const content:string;export default content;}

declare module "*.ts?raw" {const content:string;export default content;}
