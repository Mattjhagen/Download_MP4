(function () {
  const form = document.getElementById('convertForm');
  const urlInput = document.getElementById('url');
  const convertBtn = document.getElementById('convertBtn');
  const status = document.getElementById('status');

  function setStatus(text, isError) {
    status.textContent = text;
    status.classList.toggle('text-red-600', !!isError);
    status.classList.toggle('text-gray-700', !isError);
  }

  function setBusy(busy) {
    convertBtn.disabled = busy;
    convertBtn.textContent = busy ? 'Processing…' : 'Convert & Download';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    const format = document.getElementById('format').value || 'mp3';

    if (!url) {
      setStatus('Please enter a video URL.', true);
      return;
    }
    setStatus('Processing… This may take a few minutes for videos.');
    setBusy(true);
    try {
      const apiBase = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';
      const response = await fetch(apiBase + '/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format }),
      });
      const contentType = response.headers.get('Content-Type') || '';
      if (!response.ok) {
        const data = contentType.includes('application/json') ? await response.json() : {};
        setStatus('Error: ' + (data.error || response.statusText), true);
        setBusy(false);
        return;
      }
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = format === 'mp3' ? 'audio.mp3' : 'video.mp4';
      link.click();
      window.URL.revokeObjectURL(link.href);
      setStatus('Download complete!');
    } catch (err) {
      console.error(err);
      setStatus('An error occurred during conversion.', true);
    } finally {
      setBusy(false);
    }
  });
})();
