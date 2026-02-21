(function () {
  // Check for Stripe Checkout redirect status
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('success') === 'true') {
    const dName = urlParams.get('domain') || 'your domain';
    setTimeout(() => alert(`Payment successful! The registration process for ${dName} has been initiated via Dynadot.`), 500);
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (urlParams.get('canceled') === 'true') {
    setTimeout(() => alert('Domain registration was canceled.'), 500);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

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

  // --- Domain Search Logic ---
  const checkDomainBtn = document.getElementById('checkDomainBtn');
  const domainNameInput = document.getElementById('domainName');
  const domainResults = document.getElementById('domainResults');

  if (checkDomainBtn && domainNameInput && domainResults) {
    const performDomainSearch = async () => {
      const domain = domainNameInput.value.trim();
      if (!domain) {
        domainResults.innerHTML = '<p class="text-red-500 font-medium">Please enter a domain name.</p>';
        return;
      }

      // Basic validation
      const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
      if (!domainRegex.test(domain)) {
        domainResults.innerHTML = '<p class="text-red-500 font-medium">Please enter a valid domain (e.g., example.com).</p>';
        return;
      }

      domainResults.innerHTML = '<p class="text-gray-600 font-medium animate-pulse">Checking availability...</p>';

      try {
        const apiBase = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';
        const response = await fetch(apiBase + '/api/check-domain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain }),
        });

        const data = await response.json();

        if (data.available) {
          const priceStr = data.price ? `$ ${data.price}` : 'Contact for pricing';
          domainResults.innerHTML = `
            <div class="bg-green-50 border border-green-200 text-green-800 p-4 rounded-lg flex flex-col sm:flex-row justify-between items-center">
              <div>
                <p class="font-bold text-lg text-green-700">✅ ${data.domain} is available!</p>
                <p class="text-sm">Price: ${priceStr}</p>
              </div>
              <button id="buyDomainBtn" class="mt-4 sm:mt-0 bg-[#5b0ae5] hover:bg-[#763ecc] text-white font-bold py-2 px-6 rounded-lg transition-colors">
                Register Domain
              </button>
            </div>
          `;

          // Attach Stripe Checkout handler
          document.getElementById('buyDomainBtn').addEventListener('click', async () => {
            const btn = document.getElementById('buyDomainBtn');
            btn.disabled = true;
            btn.textContent = 'Redirecting to Stripe...';
            try {
              const res = await fetch(apiBase + '/api/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: data.domain, price: data.price || 15 }),
              });

              if (!res.ok) {
                const contentType = res.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                  const errorData = await res.json();
                  throw new Error(errorData.error || 'Checkout failed to initialize.');
                } else {
                  throw new Error(`Server returned HTTP ${res.status}. The backend might be deploying or misconfigured.`);
                }
              }

              const checkoutData = await res.json();
              if (checkoutData.url) {
                window.location.href = checkoutData.url;
              } else {
                throw new Error(checkoutData.error || 'Failed to initialize checkout');
              }
            } catch (err) {
              console.error('Checkout error:', err);
              alert(err.message || 'Checkout failed. Please ensure Stripe is configured.');
              btn.disabled = false;
              btn.textContent = 'Register Domain';
            }
          });
        } else {
          domainResults.innerHTML = `
            <div class="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
              <p class="font-bold text-lg text-red-700">❌ ${data.domain} is not available</p>
              <p class="text-sm">This domain is already registered. Try searching for a different domain name.</p>
            </div>
          `;
        }
      } catch (error) {
        console.error('Domain search error:', error);
        domainResults.innerHTML = '<p class="text-red-500 font-medium">Error checking domain. Please try again later.</p>';
      }
    };

    checkDomainBtn.addEventListener('click', performDomainSearch);
    domainNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') performDomainSearch();
    });
  }
})();
