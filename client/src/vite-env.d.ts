/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APP_VERSION: string;
    readonly VITE_SUPER_ADMIN_ID?: string;
    readonly VITE_SUPER_ADMIN_GROUP_NAME?: string;
    readonly VITE_API_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
