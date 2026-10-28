const fs = require('fs');
console.log(fs.readFileSync('public/sample.pdf').subarray(0, 10).toString());
