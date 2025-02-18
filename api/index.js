const express = require('express');
const axios = require('axios');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  next();
});

app.get('/proxy', async (req, res) => {
  const { query } = req;
  let targetUrl = query.url;

  if (!targetUrl) {
    return res.status(400).send('No target URL provided');
  }

  targetUrl = decodeURIComponent(targetUrl);

  try {
    const response = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': req.headers['user-agent'],
        'Accept': '*/*',
        'Cache-Control': 'no-cache',
      },
      maxRedirects: 10,
    });

    const contentType = response.headers['content-type'];

    if (contentType.includes('text/html')) {
      let htmlContent = response.data.toString('utf-8');
      const script = `
        <script src="https://cdn.jsdelivr.net/npm/eruda"></script>
        <script>eruda.init();</script>
      `;

      htmlContent = htmlContent.replace(/(\b(?:src|href|poster|srcset|data-src|data-poster|action|formaction|content|profile|cite|icon|longdesc|usemap|manifest|ping)=\"|\')(?!https?:\/\/|\/proxy\?url=)([^"<>]+)(\"|\')/gi, (match, attr, url, quote) => {
        let newUrl = new URL(url, targetUrl).href;
        return `${attr}/proxy?url=${newUrl}${quote}`;
      });

      htmlContent = htmlContent.replace(/style=["']([^"']*url\(['"]?)(?!https?:\/\/|\/proxy\?url=)([^"')]+)(['"]?\))/gi, (match, prefix, url, suffix) => {
        let newUrl = new URL(url, targetUrl).href;
        return `style="${prefix}/proxy?url=${newUrl}${suffix}`;
      });

      htmlContent = htmlContent.replace('</body>', `${script}</body>`);

      res.setHeader('Content-Type', 'text/html');
      res.status(response.status).send(htmlContent);
    } else if (contentType.includes('text/css')) {
      let cssContent = response.data.toString('utf-8');
      cssContent = cssContent.replace(/url\(\s*["']?(?!https?:\/\/|\/proxy\?url=)(\/[^"')]+)["']?\s*\)/g, (match, url) => {
        let newUrl = new URL(url, targetUrl).href;
        return `url("/proxy?url=${newUrl}")`;
      });

      res.setHeader('Content-Type', 'text/css');
      res.status(response.status).send(cssContent);
    } else if (contentType.includes('application/javascript') || contentType.includes('text/javascript')) {
      res.setHeader('Content-Type', 'application/javascript');
      res.status(response.status).send(Buffer.from(response.data));
    } else {
      res.setHeader('Content-Type', contentType);
      res.status(response.status).send(Buffer.from(response.data));
    }
  } catch (error) {
    res.status(500).send('Error proxying request');
  }
});

module.exports = app;
