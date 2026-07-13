Deno.serve(async (req) => {
    try {
        // No auth requirement: this endpoint only proxies public address lookups,
        // and published-app requests may arrive without a session token.
        const { query, lat, lng } = await req.json();
        if (!query || String(query).trim().length < 3) {
            return Response.json({ suggestions: [] });
        }

        const token = Deno.env.get('MAPBOX_API_KEY');
        const params = new URLSearchParams({
            q: String(query).trim(),
            access_token: token,
            session_token: crypto.randomUUID(),
            country: 'us',
            language: 'en',
            limit: '6',
            types: 'poi,address',
        });
        if (lat != null && lng != null) params.set('proximity', `${lng},${lat}`);

        const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?${params}`);
        if (!res.ok) throw new Error(`Mapbox request failed: ${res.status} ${await res.text()}`);
        const data = await res.json();

        const suggestions = (data.suggestions || []).map((s) => {
            const isPoi = s.feature_type === 'poi';
            const address = s.full_address || s.place_formatted || s.address || '';
            return {
                name: isPoi ? s.name : '',
                address: isPoi ? address : (s.full_address || [s.name, s.place_formatted].filter(Boolean).join(', ')),
                full: isPoi ? `${s.name} — ${address}` : (s.full_address || [s.name, s.place_formatted].filter(Boolean).join(', ')),
            };
        });

        return Response.json({ suggestions });
    } catch (error) {
        console.error('searchAddresses error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});