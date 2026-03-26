export default function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  // Debug: Environment Variable Status
  console.log('API v2 Status:', {
    hasApiKey: !!apiKey,
    apiKeyLength: apiKey?.length || 0,
    requestMethod: req.method,
    timestamp: new Date().toISOString()
  });
  
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not configured in Vercel');
    return res.status(500).json({ 
      error: 'API key not configured',
      debug: 'ANTHROPIC_API_KEY environment variable is missing'
    });
  }

  (async () => {
    try {
      console.log('Calling Claude API v2...');
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(req.body),
      });

      const data = await response.json();
      console.log('Claude API v2 response status:', response.status);
      
      return res.status(response.status).json(data);
    } catch (err) {
      console.error('Claude API v2 error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  })();
}
