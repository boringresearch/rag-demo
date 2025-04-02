document.addEventListener('DOMContentLoaded', () => {
    // -------------  Element Selection  -------------
    const uploadSection = document.querySelector('.upload-section');
    const fileInput = document.getElementById('file-input');
    const transcriptSection = document.querySelector('.transcript-section');
    const transcriptContainer = document.querySelector('.transcript-container');
    const loadingSection = document.querySelector('.loading');
    const errorMessage = document.querySelector('.error-message');
    const srtButton = document.getElementById('download-srt');
    const vttButton = document.getElementById('download-vtt');
    const examplesContainer = document.querySelector('.examples-container');

    const recordVideoBtn = document.getElementById('record-video');
    const recordAudioBtn = document.getElementById('record-audio');
    const stopRecordingBtn = document.getElementById('stop-recording');
    const recordingTime = document.getElementById('recording-time');
    const videoPreview = document.getElementById('video-preview');
    const audioVisualizer = document.getElementById('audio-visualizer');
    const audioCanvas = document.getElementById('audio-canvas');
    const recordingControls = document.querySelector('.recording-controls');
    const mediaPlayer = document.querySelector('.media-player');
    const audioPlayer = document.getElementById('audio-player');
    const videoPlayer = document.getElementById('video-player');

    const speakerCountSelect = document.getElementById('speaker-count');
    const showSpeakersToggle = document.getElementById('show-speakers');
    const clearButton = document.getElementById('clear-all');
    const modeSelect = document.getElementById('mode-select'); // New: Mode selection

    // -------------  New: Semantic Search Area  -------------
    const searchResultsContainer = document.getElementById('search-results');
    const originalTextWrapper = document.getElementById('original-text-wrapper');

    // Get sidebar elements
    const searchSidePanel = document.querySelector('.search-side-panel');
    const termsSidePanel = document.querySelector('.terms-side-panel');
    const searchPanelCloseBtn = searchSidePanel?.querySelector('.close-button');
    const termsPanelCloseBtn = termsSidePanel?.querySelector('.close-button');
    const termsContent = document.getElementById('terms-content');

    // Close button event
    if (searchPanelCloseBtn) {
        searchPanelCloseBtn.addEventListener('click', () => {
            searchSidePanel.classList.remove('active');
        });
    }

    if (termsPanelCloseBtn) {
        termsPanelCloseBtn.addEventListener('click', () => {
            termsSidePanel.classList.remove('active');
        });
    }

    // Load insurance terms content
    let termsText = '';
    async function loadTermsContent() {
        try {
            const response = await fetch('/static/noterms.md');
            if (!response.ok) throw new Error('Failed to load terms content');
            termsText = await response.text();
            
            // Initialize display of full terms
            if (termsContent) {
                termsContent.innerHTML = escapeHtml(termsText);
            }
        } catch (error) {
            console.error('Failed to load terms:', error);
            showError('Failed to load insurance terms');
        }
    }
    loadTermsContent();

    let currentTranscript = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordingInterval = null;
    let startTime = null;
    let isExample = false;

    // Load examples
    loadExamples();

    // Initialize recording events
    recordVideoBtn.addEventListener('click', () => startRecording('video'));
    recordAudioBtn.addEventListener('click', () => startRecording('audio'));
    stopRecordingBtn.addEventListener('click', stopRecording);

    // Drag and drop events
    ;['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadSection.addEventListener(eventName, preventDefaults, false);
    });
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    ;['dragenter', 'dragover'].forEach(eventName => {
        uploadSection.addEventListener(eventName, () => {
            uploadSection.classList.add('drag-over');
        });
    });
    ;['dragleave', 'drop'].forEach(eventName => {
        uploadSection.addEventListener(eventName, () => {
            uploadSection.classList.remove('drag-over');
        });
    });
    uploadSection.addEventListener('drop', handleDrop);
    uploadSection.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // Clear button
    clearButton.addEventListener('click', clearAll);

    // -------------  Function: Load Examples  -------------
    async function loadExamples() {
        try {
            const res = await fetch('/examples');
            const data = await res.json();
            if (data.success) {
                examplesContainer.innerHTML = data.examples.map(ex => `
                    <div class="example-card" data-id="${ex.id}">
                        <h4>Example ${ex.id}</h4>
                        <p>${ex.name}</p>
                    </div>
                `).join('');
                // Bind click
                document.querySelectorAll('.example-card').forEach(card => {
                    card.addEventListener('click', () => {
                        loadExample(card.dataset.id);
                    });
                });
            }
        } catch (err) {
            console.error("Failed to load examples:", err);
        }
    }

    // -------------  Function: Load Example and Display Transcript  -------------
    async function loadExample(exampleId) {
        try {
            showLoading(true);
            const res = await fetch(`/convert-example/${exampleId}`);
            const data = await res.json();
            if (data.success) {
                currentTranscript = data;
                displayTranscript(data.transcript);
                enableDownloadButtons(data);
                isExample = true;
                // Set mode to termsSearch when example is loaded
                modeSelect.value = 'termsSearch';
                // Trigger change event to ensure any listeners are notified
                modeSelect.dispatchEvent(new Event('change'));
                // Scroll to the bottom of the page
                window.scrollTo({
                    top: document.documentElement.scrollHeight,
                    behavior: 'smooth'
                });
            } else {
                throw new Error(data.error || 'Failed to process example');
            }
        } catch (err) {
            showError(err.message);
        } finally {
            showLoading(false);
        }
    }

    // -------------  Function: Start Recording  -------------
    async function startRecording(type) {
        try {
            // Check if browser supports necessary APIs
            if (!navigator.mediaDevices) {
                // Try to use older APIs
                navigator.mediaDevices = {};
            }
            
            if (!navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia = function(constraints) {
                    // Get older getUserMedia
                    const getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
                    
                    // If older API does not exist, return an error
                    if (!getUserMedia) {
                        showError("Your browser does not support recording. Please use the latest version of Chrome, Firefox, or Safari.");
                        return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
                    }
                    
                    // Wrap older API in Promise
                    return new Promise(function(resolve, reject) {
                        getUserMedia.call(navigator, constraints, resolve, reject);
                    });
                }
            }

            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                },
                video: type === 'video' ? {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } : false
            };

            // Check if running in secure context
            if (!window.isSecureContext) {
                console.warn("Page is not running in a secure context, which may affect media device access. Please use HTTPS or localhost.");
            }

            console.log("Requesting media access with constraints:", constraints);
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log("Media access granted:", stream);

            if (type === 'video') {
                videoPreview.srcObject = stream;
                videoPreview.style.display = 'block';
                audioVisualizer.style.display = 'none';
            } else {
                videoPreview.style.display = 'none';
                audioVisualizer.style.display = 'block';
                setupAudioVisualizer(stream);
            }

            mediaRecorder = new MediaRecorder(stream);
            recordedChunks = [];

            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) recordedChunks.push(e.data);
            };
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, {
                    type: (type === 'video') ? 'video/webm' : 'audio/webm'
                });
                const file = new File([blob], `recorded-${type}-${Date.now()}.webm`, {
                    type: (type === 'video') ? 'video/webm' : 'audio/webm'
                });
                handleFile(file);
            };

            mediaRecorder.start();
            startTime = Date.now();
            recordingControls.style.display = 'flex';
            recordVideoBtn.disabled = true;
            recordAudioBtn.disabled = true;
            recordingInterval = setInterval(updateRecordingTime, 1000);

        } catch (err) {
            console.error("Error starting recording:", err);
            showError("Cannot access microphone/camera");
        }
    }

    // -------------  Function: Stop Recording  -------------
    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(t => t.stop());
            clearInterval(recordingInterval);

            recordingControls.style.display = 'none';
            videoPreview.style.display = 'none';
            audioVisualizer.style.display = 'none';
            recordVideoBtn.disabled = false;
            recordAudioBtn.disabled = false;
        }
    }

    // -------------  Function: Update Recording Time  -------------
    function updateRecordingTime() {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        recordingTime.textContent = `${padZero(minutes)}:${padZero(seconds)}`;
    }
    function padZero(num) {
        return num.toString().padStart(2, '0');
    }

    // -------------  Function: Audio Visualization  -------------
    function setupAudioVisualizer(stream) {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const ctx = audioCanvas.getContext('2d');
        const width = audioCanvas.width;
        const height = audioCanvas.height;

        function draw() {
            requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);

            ctx.fillStyle = 'rgb(245, 247, 250)';
            ctx.fillRect(0, 0, width, height);

            const barWidth = (width / bufferLength) * 2.5;
            let x = 0;
            for (let i=0; i<bufferLength; i++) {
                const barHeight = dataArray[i] / 2;
                ctx.fillStyle = `rgb(74, 144, 226)`;
                ctx.fillRect(x, height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
        }
        draw();
    }

    // -------------  Function: Handle Files  -------------
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        handleFile(file);
    }
    function handleFileSelect(e) {
        const file = e.target.files[0];
        handleFile(file);
    }
    async function handleFile(file) {
        if (!file) return;
        showLoading(true);
        try {
            transcriptSection.style.display = 'none';
            errorMessage.style.display = 'none';
            srtButton.disabled = true;
            vttButton.disabled = true;

            const formData = new FormData();
            formData.append('file', file);
            const spCount = speakerCountSelect.value;
            if (spCount && spCount !== '0') {
                formData.append('speakers_expected', spCount);
            }

            const res = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                currentTranscript = data;
                displayTranscript(data.transcript);
                enableDownloadButtons(data);
                setupMediaPlayer(file);
                isExample = false;
                // Set mode to termsSearch
                modeSelect.value = 'termsSearch';
                // Trigger change event to ensure any listeners are notified
                modeSelect.dispatchEvent(new Event('change'));
                // Scroll to the bottom of the page
                window.scrollTo({
                    top: document.documentElement.scrollHeight,
                    behavior: 'smooth'
                });
            } else {
                throw new Error(data.error || "Failed to process file");
            }
        } catch (err) {
            console.error("Error handling file:", err);
            showError(err.message);
        } finally {
            showLoading(false);
        }
    }

    // -------------  Function: Setup Media Player  -------------
    function setupMediaPlayer(file) {
        const isVideo = file.type.startsWith('video/');
        mediaPlayer.style.display = 'block';
        if (isVideo) {
            videoPlayer.style.display = 'block';
            audioPlayer.style.display = 'none';
            videoPlayer.src = URL.createObjectURL(file);
        } else {
            videoPlayer.style.display = 'none';
            audioPlayer.style.display = 'block';
            audioPlayer.src = URL.createObjectURL(file);
        }
    }

    // -------------  Function: Display Transcript  -------------
    function displayTranscript(transcript) {
        console.log('displayTranscript called with:', transcript);
        currentTranscript = transcript;
        transcriptSection.style.display = 'block';
        uploadSection.style.display = 'none'; // Hide upload section when showing transcript
        transcriptContainer.innerHTML = '';

        let fullText = '';
        transcript.forEach((item, index) => {
            console.log('Creating entry for item:', item);
            const div = document.createElement('div');
            div.className = 'timestamp-entry';  
            div.setAttribute('data-start', item.start);
            div.setAttribute('data-end', item.end);
            div.setAttribute('data-index', index);

            // Add speaker label if available
            if (item.speaker) {
                const speakerLabel = document.createElement('div');  
                speakerLabel.className = 'speaker-label' + (showSpeakersToggle.checked ? '' : ' hidden');
                speakerLabel.textContent = `Speaker ${item.speaker}`;
                div.appendChild(speakerLabel);
            }

            // Add timestamp
            const tsDiv = document.createElement('div');
            tsDiv.className = 'timestamp';
            tsDiv.textContent = formatTimestamp(item.start);
            div.appendChild(tsDiv);

            // Add text
            const textDiv = document.createElement('div');
            textDiv.className = 'text';
            textDiv.textContent = item.text;
            div.appendChild(textDiv);

            // Store the text position information
            const startIdx = fullText.length;
            fullText += item.text + ' ';
            const endIdx = fullText.length - 1;
            div.setAttribute('data-start-idx', startIdx);
            div.setAttribute('data-end-idx', endIdx);

            // Single click handler for both text selection and audio jumping
            div.addEventListener('click', (e) => {
                console.log('Click event fired on:', div);
                console.log('Event target:', e.target);
                
                const mode = modeSelect.value;
                console.log('Current mode:', mode);
                
                // Get text directly from the text div
                const textDiv = div.querySelector('.text');
                console.log('Found text div:', textDiv);
                
                if (textDiv) {
                    const textContent = textDiv.textContent;
                    console.log('Text content:', textContent);

                    if (mode === 'termsSearch') {
                        console.log('Initiating search with:', textContent);
                        semanticSearch(textContent);
                        document.querySelectorAll('.timestamp-entry').forEach(d => d.classList.remove('playing'));
                        div.classList.add('playing');
                    } else if (mode === 'audioJump') {
                        console.log('Jumping to audio timestamp:', item.start);
                        jumpToAudio(parseInt(item.start));
                        document.querySelectorAll('.timestamp-entry').forEach(d => d.classList.remove('playing'));
                        div.classList.add('playing');
                    }
                } else {
                    console.error('Could not find .text element in:', div.innerHTML);
                }
            });

            transcriptContainer.appendChild(div);
        });

        // Store the full text for later use
        originalTextWrapper.setAttribute('data-full-text', fullText);
        console.log('Full text stored:', fullText.substring(0, 100) + '...');

        if (isExample) {
            enableDownloadButtons(transcript);
        }
    }

    function jumpToAudio(startMs) {
        const isVideoHidden = (videoPlayer.style.display === 'none');
        const player = isVideoHidden ? audioPlayer : videoPlayer;
        player.currentTime = startMs / 1000;
        player.play();
    }

    // -------------  Function: Search  -------------
    async function semanticSearch(queryText) {
        if (!termsText) {
            showError('Insurance terms not yet loaded, please try again later');
            return;
        }
        
        try {
            showLoading(true);
            const response = await fetch('/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: queryText,
                    text: termsText
                })
            });

            if (!response.ok) throw new Error('Search request failed');
            
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Search failed');

            // Get search results container
            const sidePanelResults = document.getElementById('side-panel-results');
            
            if (sidePanelResults && data.matches) {
                // Add search results
                sidePanelResults.innerHTML = data.matches.map(result => `
                    <div class="search-result" data-start="${result.start_idx}" data-end="${result.end_idx}">
                        <div class="score">similiarity: ${(result.score * 100).toFixed(1)}%</div>
                        <div class="content">${escapeHtml(result.text)}</div>
                    </div>
                `).join('');

                // Add click event
                document.querySelectorAll('.search-result').forEach(result => {
                    result.addEventListener('click', () => {
                        const startIdx = parseInt(result.dataset.start);
                        const endIdx = parseInt(result.dataset.end);
                        
                        // Remove other search results' active state
                        document.querySelectorAll('.search-result.active').forEach(el => {
                            if (el !== result) {
                                el.classList.remove('active');
                            }
                        });
                        
                        // Add current search result's active state
                        result.classList.add('active');
                        
                        // Show and highlight terms content
                        if (termsContent && termsText) {
                            // Keep all highlights, but update current selected highlight
                            const highlights = Array.from(document.querySelectorAll('.highlighted-section'))
                                .map(el => ({
                                    start: parseInt(el.dataset.start),
                                    end: parseInt(el.dataset.end),
                                    isActive: el.dataset.start === startIdx.toString() && el.dataset.end === endIdx.toString()
                                }));
                            
                            // Add new highlight if it does not exist
                            if (!highlights.some(h => h.start === startIdx && h.end === endIdx)) {
                                highlights.push({ start: startIdx, end: endIdx, isActive: true });
                            }
                            
                            // Sort highlights by position
                            highlights.sort((a, b) => a.start - b.start);
                            
                            // Rebuild text content
                            let lastIndex = 0;
                            let html = '';
                            
                            highlights.forEach(highlight => {
                                // Add unhighlighted text
                                html += escapeHtml(termsText.substring(lastIndex, highlight.start));
                                
                                // Add highlighted text
                                const highlightClass = highlight.isActive ? 'highlighted-section active' : 'highlighted-section';
                                html += `<span class="${highlightClass}" data-start="${highlight.start}" data-end="${highlight.end}">`;
                                html += escapeHtml(termsText.substring(highlight.start, highlight.end));
                                html += '</span>';
                                
                                lastIndex = highlight.end;
                            });
                            
                            // Add remaining text
                            html += escapeHtml(termsText.substring(lastIndex));
                            
                            termsContent.innerHTML = html;
                            
                            // Show terms panel
                            termsSidePanel.classList.add('active');
                            
                            // Scroll to current highlight
                            const activeHighlight = termsContent.querySelector('.highlighted-section.active');
                            if (activeHighlight) {
                                activeHighlight.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'center'
                                });
                            }
                        }
                    });
                });
            }

            // Show search results sidebar
            if (searchSidePanel) {
                searchSidePanel.classList.add('active');
            }
            
        } catch (error) {
            console.error("Error during semantic search:", error);
            showError(error.message);
        } finally {
            showLoading(false);
        }
    }

    // -------------  Function: Highlight  -------------
    function highlightOriginalText(fullText, startIdx, endIdx) {
        const textWrapper = document.getElementById('original-text-wrapper');
        if (!textWrapper) return;

        // If original text is not yet displayed, display it
        if (!textWrapper.innerHTML) {
            textWrapper.innerHTML = escapeHtml(fullText);
        }

        // Remove previous active state
        document.querySelectorAll('.highlighted-section.active').forEach(el => {
            el.classList.remove('active');
        });
        document.querySelectorAll('.search-result.active').forEach(el => {
            el.classList.remove('active');
        });

        // Find corresponding highlighted section and add active state
        const highlightedSections = document.querySelectorAll('.highlighted-section');
        highlightedSections.forEach(section => {
            const sectionStart = parseInt(section.dataset.start);
            const sectionEnd = parseInt(section.dataset.end);
            if (sectionStart === startIdx && sectionEnd === endIdx) {
                section.classList.add('active');
                // Scroll to view
                section.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });

        // If corresponding highlighted section is not found, create a new one
        if (!document.querySelector(`.highlighted-section[data-start="${startIdx}"][data-end="${endIdx}"]`)) {
            const before = fullText.substring(0, startIdx);
            const highlight = fullText.substring(startIdx, endIdx);
            const after = fullText.substring(endIdx);
            
            textWrapper.innerHTML = `${escapeHtml(before)}<span class="highlighted-section active" data-start="${startIdx}" data-end="${endIdx}">${escapeHtml(highlight)}</span>${escapeHtml(after)}`;
        }
    }

    // -------------  Function: HTML Escape  -------------
    function escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // -------------  Function: Enable Download Buttons  -------------
    function enableDownloadButtons(data) {
        srtButton.disabled = false;
        vttButton.disabled = false;
        srtButton.onclick = () => downloadFile(data.srt, 'transcript.srt');
        vttButton.onclick = () => downloadFile(data.vtt, 'transcript.vtt');
    }

    function downloadFile(content, filename) {
        const blob = new Blob([content], {type: 'text/plain'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // -------------  Clear All  -------------
    function clearAll() {
        fileInput.value = '';
        transcriptSection.style.display = 'none';
        transcriptContainer.innerHTML = '';
        uploadSection.style.display = 'block';
        if (videoPlayer.srcObject) {
            videoPlayer.srcObject.getTracks().forEach(t => t.stop());
            videoPlayer.srcObject = null;
        }
        videoPlayer.style.display = 'none';
        videoPlayer.src = '';

        if (audioPlayer.srcObject) {
            audioPlayer.srcObject.getTracks().forEach(t => t.stop());
            audioPlayer.srcObject = null;
        }
        audioPlayer.style.display = 'none';
        audioPlayer.src = '';
        mediaPlayer.style.display = 'none';

        if (videoPreview.srcObject) {
            videoPreview.srcObject.getTracks().forEach(t => t.stop());
            videoPreview.srcObject = null;
        }
        videoPreview.style.display = 'none';
        audioVisualizer.style.display = 'none';
        recordingControls.style.display = 'none';
        recordVideoBtn.disabled = false;
        recordAudioBtn.disabled = false;
        speakerCountSelect.value = '0';
        errorMessage.style.display = 'none';
        errorMessage.textContent = '';
        srtButton.disabled = true;
        vttButton.disabled = true;

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            if (mediaRecorder.stream) {
                mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }
        }
        currentTranscript = null;
        mediaRecorder = null;
        recordedChunks = [];
        startTime = null;
        isExample = false;
        recordingTime.textContent = '00:00';
        if (recordingInterval) {
            clearInterval(recordingInterval);
            recordingInterval = null;
        }
        if (videoPlayer.src) URL.revokeObjectURL(videoPlayer.src);
        if (audioPlayer.src) URL.revokeObjectURL(audioPlayer.src);
        loadExamples();

        // Clear search results
        searchResultsContainer.innerHTML = '';
        originalTextWrapper.innerHTML = '';
    }

    // -------------  Helper Functions  -------------
    function showError(msg) {
        errorMessage.style.display = 'block';
        errorMessage.textContent = msg;
    }
    function showLoading(show) {
        loadingSection.style.display = show ? 'block' : 'none';
    }

    function formatTimestamp(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`;
    }

    function padZero(num) {
        return num.toString().padStart(2, '0');
    }

    showSpeakersToggle.addEventListener('change', () => {
        const spLabels = document.querySelectorAll('.speaker-label');
        spLabels.forEach(label => {
            if (showSpeakersToggle.checked) label.classList.remove('hidden');
            else label.classList.add('hidden');
        });
    });
});