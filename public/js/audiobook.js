document.addEventListener('DOMContentLoaded', () => {
    // --- Donate Button Logic ---
    const donateBtn = document.getElementById('donateBtn');
    if (donateBtn) {
        donateBtn.addEventListener('click', async () => {
            const originalText = donateBtn.textContent;
            donateBtn.textContent = 'Wait...';
            donateBtn.disabled = true;
            try {
                const apiBase = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';
                const response = await fetch(apiBase + '/api/create-donation-session', { method: 'POST' });
                const data = await response.json();
                if (data.url) {
                    window.location.href = data.url;
                } else {
                    alert('Failed to initialize donation: ' + (data.error || 'Unknown error'));
                    donateBtn.textContent = originalText;
                    donateBtn.disabled = false;
                }
            } catch (err) {
                alert('Failed to connect to donation service.');
                donateBtn.textContent = originalText;
                donateBtn.disabled = false;
            }
        });
    }

    // --- Audiobook Logic ---
    const epubInput = document.getElementById('epubInput');
    const epubDropzone = document.getElementById('epubDropzone');
    const epubStatus = document.getElementById('epubStatus');
    const chaptersList = document.getElementById('chaptersList');
    const audioPlayerContainer = document.getElementById('audioPlayerContainer');
    const audioPlayer = document.getElementById('audioPlayer');
    const nowPlayingTitle = document.getElementById('nowPlayingTitle');
    const ttsProvider = document.getElementById('ttsProvider');
    const ttsApiKey = document.getElementById('ttsApiKey');
    const playbackSpeed = document.getElementById('playbackSpeed');
    const speedValue = document.getElementById('speedValue');

    if (playbackSpeed && speedValue) {
        playbackSpeed.addEventListener('input', (e) => {
            const speed = parseFloat(e.target.value).toFixed(1);
            speedValue.textContent = `${speed}x`;
            if (audioPlayer) {
                audioPlayer.playbackRate = speed;
            }
        });
    }

    let currentChapters = [];
    let isGenerating = false;
    let currentAudioUrl = null;

    if (!epubInput || !epubDropzone) return;

    const showStatus = (msg, isError = false) => {
        epubStatus.textContent = msg;
        epubStatus.classList.remove('hidden');
        if (isError) {
            epubStatus.classList.add('text-red-600');
            epubStatus.classList.remove('text-gray-700');
        } else {
            epubStatus.classList.remove('text-red-600');
            epubStatus.classList.add('text-gray-700');
        }
    };

    const handleFileUpload = async (file) => {
        if (!file || !file.name.endsWith('.epub')) {
            showStatus('Please upload a valid .epub file', true);
            return;
        }

        showStatus('Uploading and parsing EPUB...');
        chaptersList.innerHTML = '';
        currentChapters = [];
        audioPlayerContainer.classList.add('hidden');

        const formData = new FormData();
        formData.append('epubFile', file);

        try {
            const apiBase = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';
            const response = await fetch(apiBase + '/api/parse-epub', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to parse EPUB');
            }

            currentChapters = await response.json();

            if (currentChapters.length === 0) {
                showStatus('No readable text found in this EPUB.', true);
                return;
            }

            showStatus(`Successfully parsed ${currentChapters.length} chapters.`);
            renderChapters();
        } catch (error) {
            showStatus(error.message, true);
        }
    };

    epubInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    epubDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        epubDropzone.classList.add('bg-gray-100', 'border-[#5b0ae5]');
    });

    epubDropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        epubDropzone.classList.remove('bg-gray-100', 'border-[#5b0ae5]');
    });

    epubDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        epubDropzone.classList.remove('bg-gray-100', 'border-[#5b0ae5]');
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    const renderChapters = () => {
        chaptersList.innerHTML = '';
        currentChapters.forEach((chapter, index) => {
            const item = document.createElement('div');
            item.className = 'bg-white border text-left border-gray-200 p-4 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'flex-grow';
            const title = document.createElement('h4');
            title.className = 'font-bold text-gray-800';
            title.textContent = chapter.title;
            const preview = document.createElement('p');
            preview.className = 'text-xs text-gray-500 mt-1 line-clamp-2';
            preview.textContent = chapter.text.substring(0, 150) + '...';

            titleDiv.appendChild(title);
            titleDiv.appendChild(preview);

            const btn = document.createElement('button');
            btn.className = 'bg-[#5b0ae5] text-white px-4 py-2 rounded font-medium text-sm hover:bg-[#763ecc] transition-colors whitespace-nowrap read-btn';
            btn.textContent = 'Generate & Play';
            btn.onclick = () => playChapter(index, btn);

            item.appendChild(titleDiv);
            item.appendChild(btn);
            chaptersList.appendChild(item);
        });
    };

    const playChapter = async (index, buttonElement) => {
        if (isGenerating) {
            alert('Already generating audio, please wait...');
            return;
        }

        const provider = ttsProvider.value;
        const apiKey = ttsApiKey.value.trim();

        if (provider !== 'kokoro' && !apiKey) {
            alert(`Please enter your ${provider.toUpperCase()} API Key first.`);
            return;
        }

        const chapter = currentChapters[index];
        const textToRead = chapter.text;

        isGenerating = true;
        const originalBtnText = buttonElement.textContent;
        buttonElement.textContent = 'Generating...';
        buttonElement.disabled = true;
        buttonElement.classList.add('opacity-50');

        if (currentAudioUrl) {
            URL.revokeObjectURL(currentAudioUrl);
            currentAudioUrl = null;
        }

        try {
            const audioBlob = await generateAudio(provider, apiKey, textToRead);
            currentAudioUrl = URL.createObjectURL(audioBlob);

            audioPlayer.src = currentAudioUrl;
            if (playbackSpeed) {
                audioPlayer.playbackRate = parseFloat(playbackSpeed.value);
            }
            nowPlayingTitle.textContent = `Now Playing: ${chapter.title}`;
            audioPlayerContainer.classList.remove('hidden');
            audioPlayer.play();
        } catch (err) {
            console.error(err);
            alert('Failed to generate audio: ' + err.message);
        } finally {
            isGenerating = false;
            buttonElement.textContent = originalBtnText;
            buttonElement.disabled = false;
            buttonElement.classList.remove('opacity-50');
        }
    };

    // --- TTS Generation Logic (Ported from Listenova) ---
    const generateAudio = async (provider, apiKey, text) => {
        switch (provider) {
            case 'kokoro':
                return await generateAudioKokoro(text);
            case 'gemini':
                return await generateAudioGemini(text, apiKey);
            case 'openai':
                return await generateAudioOpenAI(text, apiKey);
            case 'elevenlabs':
                return await generateAudioElevenLabs(text, apiKey);
            default:
                throw new Error('Unsupported provider');
        }
    };

    const generateAudioKokoro = async (text) => {
        // Kokoro-TTS via HuggingFace Spaces Gradio API
        // Gradio endpoint format for Kokoro usually accepts: text, voice, speed
        // The space endpoint is https://hexgrad-kokoro-tts.hf.space/api/predict
        // The /api/predict requires the fn_index (usually 0) and the data array
        const response = await fetch('https://hexgrad-kokoro-tts.hf.space/call/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: [
                    text,
                    "af_heart", // Voice Name
                    1.0 // speed is handled by the slider after generation, so default 1.0 here
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`Kokoro API Error ${response.status}`);
        }

        const eventIdData = await response.json();
        const eventId = eventIdData.event_id;

        // Wait for Gradio to process the queue and return the audio file URL
        return await new Promise((resolve, reject) => {
            const checkStatus = async () => {
                try {
                    const res = await fetch(`https://hexgrad-kokoro-tts.hf.space/call/generate/${eventId}`);
                    const textStr = await res.text();

                    // Gradio streams Server Sent Events. Read the lines.
                    const lines = textStr.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const dataObj = JSON.parse(line.substring(6));
                            if (dataObj.msg === 'process_completed' && dataObj.success) {
                                // Gradio returns the output. Usually an object with 'name' property
                                // audio info: dataObj.output.data[0]
                                const audioInfo = dataObj.output.data[0];
                                // Need to fetch the actual audio blob from the Space
                                const audioUrl = `https://hexgrad-kokoro-tts.hf.space/file=${audioInfo.name}`;
                                const audioRes = await fetch(audioUrl);
                                const blob = await audioRes.blob();
                                resolve(blob);
                                return;
                            } else if (dataObj.msg === 'process_completed' && !dataObj.success) {
                                reject(new Error('Kokoro generation failed.'));
                                return;
                            }
                        }
                    }

                    setTimeout(checkStatus, 1000); // Poll again
                } catch (e) {
                    reject(e);
                }
            };
            checkStatus();
        });
    };

    const generateAudioGemini = async (text, apiKey) => {
        // Note: Gemini text-to-speech requires gemini-2.0-flash or experimental models on the v1alpha endpoint
        const url = `https://generativelanguage.googleapis.com/v1alpha/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        // We send a direct prompt requesting audio output and force responseModalities
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: "Read the following text out loud natively and clearly without adding any introduction or conversational filler. Text to read: \n\n" + text }]
                }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: "Aoede" // Valid names: Puck, Charon, Kore, Fenrir, Aoede
                            }
                        }
                    }
                }
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Gemini API Error ${response.status}`);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        const part = candidate?.content?.parts?.find(p => p.inlineData);

        if (!part || !part.inlineData || !part.inlineData.data) {
            throw new Error('Gemini API did not return audio data. Ensure your key has access to gemini-2.0-flash.');
        }

        // Base64 to Blob
        const base64Audio = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || 'audio/wav';
        const byteCharacters = atob(base64Audio);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    };

    const generateAudioOpenAI = async (text, apiKey) => {
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'tts-1',
                input: text,
                voice: 'alloy',
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `OpenAI API Error ${response.status}`);
        }

        return await response.blob();
    };

    const generateAudioElevenLabs = async (text, apiKey) => {
        const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
        const voiceId = '21m00Tcm4TlvDq8ikWAM'; // Default Rachel voice

        // ElevenLabs has strict length limits per request, usually requires chunking for entire chapters.
        // For simplicity, we just send it all, but note it might fail for very long chapters.
        const response = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'xi-api-key': apiKey,
            },
            body: JSON.stringify({
                text: text,
                model_id: "eleven_monolingual_v1",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                }
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail?.message || err.message || `ElevenLabs API Error ${response.status}`);
        }

        return await response.blob();
    };

});
