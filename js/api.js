// This is likely the correct final domain
const VERIFIED_VERCEL_DOMAIN = 'https://sonauto-vercel-proxy.vercel.app'; 
const CORS_BYPASS = 'https://corsproxy.io/?';

// CRITICAL: Ensure the correct API paths are used.
const SONAUTO_PROXY_URL = `${CORS_BYPASS}${VERIFIED_VERCEL_DOMAIN}/api/sonauto`;
const AUTH_PROXY_URL = `${CORS_BYPASS}${VERIFIED_VERCEL_DOMAIN}/api/auth`;

let accessToken = null;

export function setAccessToken(token) {
    accessToken = token;
}

export function getAccessToken() {
    return accessToken;
}

async function fetchApi(path, options = {}, target = 'sonauto') {
    const baseUrl = target === 'auth' ? AUTH_PROXY_URL : SONAUTO_PROXY_URL;
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    let lastErr = null;

    if (target === 'sonauto' && accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
        const proxyUrl = `${baseUrl}${path}`;
        const response = await fetch(proxyUrl, { ...options, headers });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${body}`);
        }
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) return response.json();
        return response.text();
    } catch (err) {
        lastErr = err;
    }
    throw lastErr || new Error('Proxy request failed');
}

export function generateSong(params) {
    return fetchApi('/generations', {
        method: 'POST',
        body: JSON.stringify(params),
    }, 'sonauto');
}

export function getGeneration(taskId) {
    return fetchApi(`/generations/${taskId}`, {}, 'sonauto');
}

// --- Auth Functions ---
export function getChallenge() {
    return fetchApi('/challenge', {}, 'auth');
}

export function verifyChallenge(challenge_token, username) {
    return fetchApi('/verify', {
        method: 'POST',
        body: JSON.stringify({ challenge_token, username }),
    }, 'auth');
}