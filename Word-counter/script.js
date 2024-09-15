let selectedFile = null;
        let accessToken = null;
        const pricePerWord = 0.05;

        document.getElementById('fileInput').addEventListener('change', function(event) {
            selectedFile = event.target.files[0];
            document.getElementById('checkBtn').disabled = false;
            document.getElementById('uploadBtn').disabled = false;
        });

        document.getElementById('checkBtn').addEventListener('click', function() {
            if (!selectedFile) {
                alert('Please select a file first!');
                return;
            }

            const fileExtension = selectedFile.name.split('.').pop().toLowerCase();
            if (fileExtension === 'pdf') {
                countWordsInPDF(selectedFile);
            } else if (fileExtension === 'docx') {
                countWordsInDOCX(selectedFile);
            } else {
                alert('Unsupported file type! Please upload a PDF or DOCX document.');
            }
        });

        document.getElementById('uploadBtn').addEventListener('click', function() {
            if (!selectedFile) {
                alert('Please select a file first!');
                return;
            }

            if (!accessToken) {
                authenticateUser();
                return;
            }

            const name = document.getElementById('nameInput').value;
            const phone = document.getElementById('phoneInput').value;
            const address = document.getElementById('addressInput').value;
            const status = document.getElementById('statusInput').value;

            if (name && phone && address) {
                const folderName = `${name}-${phone}-${getCurrentDateTime()}`;
                uploadFileToDrive(selectedFile, folderName, name, phone, address, status);
            } else {
                alert('Please fill in all required fields.');
            }
        });

        function authenticateUser() {
            const clientId = 'YOUR_GOOGLE_CLIENT_ID';
            const scope = 'https://www.googleapis.com/auth/drive.file';
            const redirectUri = window.location.origin;

            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=token&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&include_granted_scopes=true`;

            window.location.href = authUrl;
        }

        window.onload = function() {
            const hashParams = new URLSearchParams(window.location.hash.substr(1));
            if (hashParams.has('access_token')) {
                accessToken = hashParams.get('access_token');
            }
        };

        function uploadFileToDrive(file, folderName, name, phone, address, status) {
            createFolderIfNotExist(folderName).then((folderId) => {
                const formData = new FormData();
                formData.append('metadata', new Blob([JSON.stringify({
                    name: file.name,
                    parents: [folderId]
                })], { type: 'application/json' }));
                formData.append('file', file);

                fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + accessToken,
                    },
                    body: formData
                })
                .then(response => response.json())
                .then(result => {
                    alert('File uploaded to Google Drive!');
                    generatePDF(name, phone, address, status, folderId);
                })
                .catch(error => {
                    console.error('Error uploading file:', error);
                });
            });
        }

        function createFolderIfNotExist(folderName) {
            return fetch(`https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder'`, {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json',
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.files.length > 0) {
                    return data.files[0].id;
                } else {
                    return createFolder(folderName);
                }
            });
        }

        function createFolder(folderName) {
            return fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder',
                })
            })
            .then(response => response.json())
            .then(data => data.id);
        }

        function generatePDF(name, phone, address, status, folderId) {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const wordCount = document.getElementById('wordCount').textContent.split(': ')[1];
            const finalBill = wordCount * pricePerWord;

            doc.text(`Name: ${name}`, 10, 10);
            doc.text(`Phone: ${phone}`, 10, 20);
            doc.text(`Address: ${address}`, 10, 30);
            doc.text(`Status: ${status}`, 10, 40);
            doc.text(`Word Count: ${wordCount}`, 10, 50);
            doc.text(`Final Bill: INR ${finalBill.toFixed(2)}`, 10, 60);

            const pdfBlob = doc.output('blob');

            const formData = new FormData();
            formData.append('metadata', new Blob([JSON.stringify({
                name: 'UserDetails.pdf',
                parents: [folderId]
            })], { type: 'application/json' }));
            formData.append('file', pdfBlob);

            fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                },
                body: formData
            })
            .then(response => response.json())
            .then(result => {
                alert('User details uploaded to Google Drive!');
            })
            .catch(error => {
                console.error('Error uploading user details:', error);
            });
        }

        function countWordsInPDF(file) {
            const reader = new FileReader();
            reader.onload = function() {
                const typedArray = new Uint8Array(this.result);
                pdfjsLib.getDocument(typedArray).promise.then(function(pdf) {
                    let totalWords = 0;
                    let pagesPromises = [];

                    for (let i = 0; i < pdf.numPages; i++) {
                        pagesPromises.push(pdf.getPage(i + 1).then(function(page) {
                            return page.getTextContent().then(function(textContent) {
                                const pageText = textContent.items.map(item => item.str).join(' ');
                                totalWords += countWords(pageText);
                            });
                        }));
                    }

                    Promise.all(pagesPromises).then(function() {
                        document.getElementById('wordCount').textContent = 'Word Count: ' + totalWords;
                        updateFinalBill(totalWords);
                    });
                });
            };
            reader.readAsArrayBuffer(file);
        }

        function countWordsInDOCX(file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const arrayBuffer = event.target.result;
                JSZip.loadAsync(arrayBuffer).then(function(zip) {
                    return zip.file("word/document.xml").async("string");
                }).then(function(text) {
                    const docText = new DOMParser().parseFromString(text, "application/xml").textContent;
                    const wordCount = countWords(docText);
                    document.getElementById('wordCount').textContent = 'Word Count: ' + wordCount;
                    updateFinalBill(wordCount);
                }).catch(function(error) {
                    alert('Error reading the DOCX file!');
                });
            };
            reader.readAsArrayBuffer(file);
        }

        function countWords(text) {
            return text.trim().split(/\s+/).length;
        }

        function updateFinalBill(wordCount) {
            const finalBill = wordCount * pricePerWord;
            document.getElementById('finalBill').textContent = `Final Bill: INR ${finalBill.toFixed(2)}`;
        }

        function getCurrentDateTime() {
            const now = new Date();
            const date = now.toLocaleDateString('en-GB').split('/').reverse().join('-');
            const time = now.toLocaleTimeString('en-GB').replace(/:/g, '-');
            return `${date}-${time}`;
        }