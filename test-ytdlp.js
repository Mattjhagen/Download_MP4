const youtubedl = require('youtube-dl-exec');
const path = require('path');
const url = 'https://www.youtube.com/watch?v=_yfiUQSbdPY';
const videoFile = path.join(__dirname, 'tmp', 'test-output.mp4');
console.log('Starting yt-dlp test...');
const exec = youtubedl.create('/opt/homebrew/bin/yt-dlp');
exec(url, {
  output: videoFile,
  format: 'bestaudio/best',
  noCheckCertificates: true,
  noWarnings: true,
  preferFreeFormats: false,
  addHeader: ['referer:https://www.youtube.com/', 'user-agent: Mozilla/5.0']
})
.then(output => console.log('Success:', output))
.catch(err => {
  console.error('yt-dlp failed:', err.message);
  console.error('stderr:', err.stderr);
});
