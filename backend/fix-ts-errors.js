const fs = require('fs');
const path = require('path');

// Fix unused req parameters by prefixing with _
function fixUnusedReq(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Pattern: (req: Request, res: Response) where req is unused
  // Replace with (_req: Request, res: Response)
  const patterns = [
    /\(req: Request, res: Response\)/g,
    /\(req: Request, res: Response, next: NextFunction\)/g
  ];

  patterns.forEach(pattern => {
    if (content.match(pattern)) {
      content = content.replace(pattern, match => {
        return match.replace('req:', '_req:');
      });
      modified = true;
    }
  });

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed: ${filePath}`);
  }
}

// Files to fix
const files = ['server.ts', 'routes/api.ts', 'routes/telemetry.ts'];

files.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    fixUnusedReq(fullPath);
  }
});

console.log('Automated fixes complete');
