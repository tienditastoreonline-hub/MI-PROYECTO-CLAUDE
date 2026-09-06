/** Variables mínimas para los módulos de servidor bajo prueba. */
process.env.ENCRYPTION_KEY ??= '0'.repeat(64);
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service-role-de-prueba';
process.env.VAPI_API_KEY ??= 'vapi-key-de-prueba';
process.env.VAPI_WEBHOOK_SECRET ??= 'secreto-de-webhook-para-pruebas';
process.env.GOOGLE_CLIENT_ID ??= 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'google-client-secret';
process.env.GOOGLE_REDIRECT_URI ??= 'http://localhost:3000/api/google/oauth/callback';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'clave-publica-de-prueba';
