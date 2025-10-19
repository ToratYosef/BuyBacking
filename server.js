const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const rootDir = __dirname;

app.use(express.static(rootDir, {
  extensions: ['html'],
  index: ['index.html'],
  dotfiles: 'ignore'
}));

app.use((req, res, next) => {
  const requestedPath = path.normalize(path.join(rootDir, req.path));

  if (!requestedPath.startsWith(rootDir)) {
    return res.status(404).end();
  }

  if (requestedPath.startsWith(path.join(rootDir, 'node_modules'))) {
    return res.status(404).end();
  }

  if (path.extname(req.path) === '') {
    const htmlPath = `${requestedPath}.html`;
    return res.sendFile(htmlPath, (err) => {
      if (err) {
        next();
      }
    });
  }

  next();
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(rootDir, '404.html'), (err) => {
    if (err) {
      res.status(404).send('Page not found');
    }
  });
});

app.listen(PORT, () => {
  console.log(`BuyBacking site running at http://localhost:${PORT}`);
});
