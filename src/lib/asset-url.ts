// Vite supplies the deployment path, including its trailing slash.
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
