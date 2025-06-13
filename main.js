
        // Import the functions you need from the SDKs you need
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
        // Import Storage functions
        import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, listAll } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-storage.js"; // Added listAll for folder deletion
        import { getFirestore, collection, addDoc, getDocs, onSnapshot, doc, setDoc, updateDoc, deleteDoc, setLogLevel, getDoc } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js"; // Added deleteDoc
        // Only import functions needed for manual email/password login and general auth state
        import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
        
        // Your web app's Firebase configuration
        const firebaseConfig = {
            apiKey: "AIzaSyBCcitEPrzhHOshpFNrCdKHF5tgE5C8Yd4",
            authDomain: "gestiontaller-c1625.firebaseapp.com",
            projectId: "gestiontaller-c1625",
            storageBucket: "gestiontaller-c1625.firebasestorage.app",
            messagingSenderId: "493977495867",
            appId: "1:493977495867:web:12beee36bf01c3f505ef1e",
            measurementId: "G-HRF85HS1EK"
        };

        // **** CAMBIO CLAVE AQUI ****
        // Forzamos el appId a la ruta correcta que el usuario indicó en los logs
        const appId = "8a405daa33ed-jewelry-workshop-app-simplified-auth-473"; 
        // Si tienes otro appId en tu proyecto de Firebase, DEBES cambiar esta línea a ESE valor.

        // Initialize Firebase
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        const auth = getAuth(app);
        const storage = getStorage(app); // Initialize Firebase Storage
        
        // Enable Firestore debug logging (useful for debugging Firebase issues)
        setLogLevel('debug');

        let localEnvelopesCache = [];
        let envelopesCollection; // This will hold the user-specific collection reference
        let unsubscribe = null;
        let userId;

        let tempImageFilesData = []; // Stores { dataUrl (base64 for preview), file (File object) } for newly selected images not yet uploaded
        let existingEnvelopeImageUrls = []; // Stores URLs of images already saved in Firestore for the current envelope
        let imagesToDeleteFromStorage = []; // Stores URLs of images removed from an existing envelope that need to be deleted from Storage

        const loader = document.getElementById('loader');
        const authContainer = document.getElementById('auth-container');
        const appContainer = document.getElementById('app');
        const loginErrorMessage = document.getElementById('login-error-message');
        const customerShareLinkInput = document.getElementById('customer-share-link-input');
        const customerCopyLinkBtn = document.getElementById('customer-copy-link-btn');
        const customerShareLinkContainer = document.getElementById('customer-share-link-container');
        const saveSuccessMessage = document.getElementById('save-success-message'); // New: success message element
        const trackingErrorMessage = document.getElementById('tracking-error-message'); // New: Error message for tracking view


        /**
         * Clears any displayed authentication error messages.
         */
        function clearAuthErrors() {
            loginErrorMessage.classList.add('hidden');
            loginErrorMessage.textContent = '';
            saveSuccessMessage.classList.add('hidden'); // Also clear success message
            trackingErrorMessage.classList.add('hidden'); // Also clear tracking error message
        }

        /**
         * Displays an authentication error message in the specified element.
         * @param {HTMLElement} element - The HTML element to display the error.
         * @param {string} message - The error message to display.
         */
        function showAuthError(element, message) {
            element.textContent = message;
            element.classList.remove('hidden');
        }

        /**
         * Displays a success message for save operations.
         */
        function showSaveSuccessMessage() {
            saveSuccessMessage.classList.remove('hidden');
            console.log("[showSaveSuccessMessage] Success message displayed."); // Log para depuración
            setTimeout(() => {
                saveSuccessMessage.classList.add('hidden');
                console.log("[showSaveSuccessMessage] Success message hidden after timeout."); // Log para depuración
            }, 3000); // Hide after 3 seconds
        }

        /**
         * Displays an error message specifically for the customer tracking view.
         * @param {string} message - The error message to display.
         */
        function showTrackingError(message) {
            trackingErrorMessage.textContent = message;
            trackingErrorMessage.classList.remove('hidden');
        }

        // Authentication state observer
        onAuthStateChanged(auth, (user) => {
            loader.classList.add('hidden'); // Always hide initial loader after auth check
            loader.querySelector('p').textContent = "Conectando con la base de datos..."; // Reset loader text
            clearAuthErrors(); // Clear all error messages on auth state change

            if (user) {
                // User is signed in.
                userId = user.uid;
                console.log("User is signed in:", userId);
                authContainer.classList.add('hidden');
                appContainer.classList.remove('hidden');
                document.getElementById('user-welcome').textContent = `Bienvenido, ${user.email}`; 

                // Stop previous real-time listener if it exists
                if (unsubscribe) unsubscribe();
                
                // Define the Firestore collection path based on the authenticated user
                // Usamos el appId corregido aquí también.
                envelopesCollection = collection(db, `/artifacts/${appId}/users/${userId}/envelopes`);
                
                // Set up new real-time listener for envelopes specific to this user
                unsubscribe = onSnapshot(envelopesCollection, (snapshot) => {
                    localEnvelopesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    console.log("Data refreshed from Firestore:", localEnvelopesCache.length, "envelopes for user", userId);
                    updateAll(); // Update UI with fresh data
                    loader.classList.add('hidden'); // Hide loader once data is loaded
                }, (error) => {
                    console.error("Error getting real-time updates:", error);
                    showAuthError(loginErrorMessage, "Error al conectar con la base de datos: " + error.message);
                    loader.classList.add('hidden');
                });
            } else {
                // User is signed out.
                console.log("User is signed out, showing login.");
                userId = null;
                // Stop real-time listener when user signs out
                if(unsubscribe) unsubscribe();
                authContainer.classList.remove('hidden'); // Show auth container
                appContainer.classList.add('hidden'); // Hide main app
            }
        });


        // --- END FIREBASE SETUP ---

        // --- Gemini API Call Function (Updated for multimodal) ---
        async function callGeminiAPI(prompt, buttonToDisable, image = null) {
            const loader = document.getElementById('loader');
            if (buttonToDisable) buttonToDisable.disabled = true;
            loader.classList.remove('hidden');
            loader.querySelector('p').textContent = "Consultando al asistente de IA...";


            const apiKey = ""; // API Key will be handled by the environment
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            
            const parts = [{ text: prompt }];
            if (image && image.data && image.mimeType) {
                parts.push({
                    inlineData: {
                        mimeType: image.mimeType,
                        data: image.data
                    }
                });
            }

            const payload = {
                contents: [{ parts }]
            };

            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorBody = await response.text();
                    throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
                }

                const result = await response.json();
                
                if (result.candidates && result.candidates.length > 0 &&
                    result.candidates[0].content && result.candidates[0].content.parts &&
                    result.candidates[0].content.parts.length > 0) {
                    return result.candidates[0].content.parts[0].text;
                } else {
                    console.error("Gemini API response format is unexpected:", result);
                    return "No se pudo obtener una respuesta válida. Por favor, intente de nuevo.";
                }
            } catch (error) {
                console.error("Error calling Gemini API:", error);
                showAuthError(loginErrorMessage, `Error al comunicarse con el asistente de IA: ${error.message}`); 
                return null;
            } finally {
                if (buttonToDisable) buttonToDisable.disabled = false;
                loader.classList.add('hidden');
                loader.querySelector('p').textContent = "Conectando con la base de datos...";
            }
        }
        
        const SUCURSALES = { 'LUX': 'LUXOTIME', 'TIK': 'TIKA JOYAS', 'JOY': 'LA JOYITA' };
        const STATUSES = {
            recibido: { text: 'Recibido', color: 'bg-blue-100', textColor: 'text-blue-800' },
            en_taller: { text: 'En Taller', color: 'bg-purple-100', textColor: 'text-purple-800' },
            esperando_pieza: { text: 'Esperando Pieza', color: 'bg-yellow-100', textColor: 'text-yellow-800' },
            finalizado: { text: 'Finalizado', color: 'bg-green-100', textColor: 'text-green-800' },
            entregado: { text: 'Entregado', color: 'bg-slate-100', textColor: 'text-slate-800' },
            cancelado: { text: 'Cancelado', color: 'bg-red-100', textColor: 'text-red-800' },
        };
        const VENDEDORES = ['DAMIAN', 'MAURICIO', 'IVO', 'AZUL', 'CECILIA','LEANDRO','FLORENCIA'];

        let statusChart;
        let currentDate = new Date();
        // Image related state variables are now global for easier access across functions
        // and initialized at the top of the script.

        const formatDate = (dateString) => {
            if (!dateString) return 'N/A';
            const date = new Date(dateString + 'T00:00:00');
            return new Intl.DateTimeFormat('es-AR').format(date);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        
        function updateAll() {
            renderEnvelopeList();
            updateDashboard();
            renderCalendar();
        }
        
        function updateDashboard() {
            updateStatusChart();
            updateAlerts();
        }
        
        function updateStatusChart() {
            const statusCounts = Object.keys(STATUSES).reduce((acc, key) => { acc[key] = 0; return acc; }, {});
            localEnvelopesCache.filter(d => d.status !== 'entregado' && d.status !== 'cancelado').forEach(e => {
                if (statusCounts.hasOwnProperty(e.status)) statusCounts[e.status]++;
            });
            
            const chartData = {
                labels: Object.keys(statusCounts).map(key => STATUSES[key].text),
                datasets: [{
                    label: 'Nº de Sobres',
                    data: Object.values(statusCounts),
                    borderWidth: 1
                }]
            };

            const chartColors = {
                'recibido': 'rgb(96, 165, 250)', 'en_taller': 'rgb(167, 139, 250)',
                'esperando_pieza': 'rgb(250, 204, 21)', 'finalizado': 'rgb(74, 222, 128)',
                'entregado': 'rgb(203, 213, 225)', 'cancelado': 'rgb(248, 113, 113)',
            };
            chartData.datasets[0].backgroundColor = Object.keys(statusCounts).map(status => chartColors[status] || 'rgb(107, 114, 128)');
            chartData.datasets[0].borderColor = Object.keys(statusCounts).map(status => chartColors[status] || 'rgb(107, 114, 128)');
            
            const ctx = document.getElementById('statusChart').getContext('2d');
            if(statusChart) {
                statusChart.data = chartData;
                statusChart.update();
            } else {
                statusChart = new Chart(ctx, { type: 'bar', data: chartData, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } }, y: { grid: { display: false } } } } });
            }
        }

        function updateAlerts() {
            const todayStr = today.toISOString().split('T')[0];
            const tomorrowStr = tomorrow.toISOString().split('T')[0];
            const alertsTodayContainer = document.getElementById('alerts-today');
            const alertsTomorrowContainer = document.getElementById('alerts-tomorrow');

            const createAlertLinks = (deliveries) => deliveries.length > 0 ? deliveries.map(e => `<a href="#" class="block hover:underline" data-id="${e.id}">${e.envelopeId}: ${e.clientName}</a>`).join('') : '<p class="text-sm italic">Sin entregas programadas.</p>';

            alertsTodayContainer.innerHTML = createAlertLinks(localEnvelopesCache.filter(e => e.deliveryDate === todayStr && e.status !== 'entregado' && e.status !== 'cancelado'));
            alertsTomorrowContainer.innerHTML = createAlertLinks(localEnvelopesCache.filter(e => e.deliveryDate === tomorrowStr && e.status !== 'entregado' && e.status !== 'cancelado'));
            
            document.querySelectorAll('#alerts-today a, #alerts-tomorrow a').forEach(link => link.addEventListener('click', (event) => { event.preventDefault(); openModal(event.target.dataset.id); }));
        }
        
        function renderCalendar() {
            const calendarDaysContainer = document.getElementById('calendar-days');
            const monthYearEl = document.getElementById('month-year');
            calendarDaysContainer.innerHTML = '';
            const month = currentDate.getMonth();
            const year = currentDate.getFullYear();
            
            let monthYearString = new Date(year, month).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
            monthYearEl.textContent = monthYearString.charAt(0).toUpperCase() + monthYearString.slice(1);

            const firstDayOfMonth = new Date(year, month, 1);
            const startDay = (firstDayOfMonth.getDay() + 6) % 7;
            const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
            
            const deliveriesByDay = localEnvelopesCache.reduce((acc, e) => { if (e.deliveryDate) { acc[e.deliveryDate] = (acc[e.deliveryDate] || 0) + 1; } return acc; }, {});


            for (let i = 0; i < startDay; i++) { calendarDaysContainer.insertAdjacentHTML('beforeend', '<div></div>'); }
            
            for (let day = 1; day <= totalDaysInMonth; day++) {
                const dayDate = new Date(year, month, day);
                const dayDateStr = dayDate.toISOString().split('T')[0];
                const dayEl = document.createElement('div');
                dayEl.textContent = day;
                dayEl.className = 'calendar-day flex items-center justify-center h-9 w-9 rounded-full mx-auto';
                if (dayDate.getTime() === today.getTime()) dayEl.classList.add('today');
                if (deliveriesByDay[dayDateStr]) {
                    dayEl.classList.add('has-delivery');
                    dayEl.title = `${deliveriesByDay[dayDateStr]} entrega(s)`;
                }
                calendarDaysContainer.appendChild(dayEl);
            }
        }
        
        function renderEnvelopeList() {
            const tableBody = document.getElementById('envelopes-table-body');
            const noResultsEl = document.getElementById('no-results');
            const searchTerm = document.getElementById('search-input').value.toLowerCase();
            const statusFilter = document.getElementById('filter-status').value;
            const vendorFilter = document.getElementById('filter-vendor').value;
            const branchFilter = document.getElementById('filter-branch').value;

            const filteredData = localEnvelopesCache.filter(e => {
                const searchPool = [e.envelopeId, e.clientName, e.itemDescription, e.workDescription].join(' ').toLowerCase();
                const matchesSearch = searchTerm === '' || searchPool.includes(searchTerm);
                const matchesStatus = statusFilter === '' || e.status === statusFilter;
                const matchesVendor = vendorFilter === '' || e.vendor === vendorFilter;
                const matchesBranch = branchFilter === '' || e.branch === branchFilter;
                return matchesSearch && matchesStatus && matchesVendor && matchesBranch;
            });

            noResultsEl.classList.toggle('hidden', filteredData.length === 0);
            tableBody.innerHTML = filteredData.length > 0 ? filteredData.map(e => {
                const statusInfo = STATUSES[e.status] || { text: 'Desconocido', color: 'bg-gray-100', textColor: 'text-gray-800' };
                return `<tr class="bg-white border-b hover:bg-slate-50">
                            <td class="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">${e.envelopeId}</td>
                            <td class="px-6 py-4">${e.clientName}</td>
                            <td class="px-6 py-4">${SUCURSALES[e.branch]}</td>
                            <td class="px-6 py-4">${formatDate(e.deliveryDate)}</td>
                            <td class="px-6 py-4"><span class="px-2 py-1 text-xs font-medium rounded-full ${statusInfo.color} ${statusInfo.textColor}">${statusInfo.text}</span></td>
                            <td class="px-6 py-4 text-right"><button data-id="${e.id}" class="edit-btn font-medium text-teal-600 hover:underline">Editar</button></td>
                        </tr>`;
            }).join('') : '';
            
            document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', (e) => openModal(e.target.dataset.id)));
        }
        
        function populateFilters() {
            const branchFilter = document.getElementById('filter-branch');
            const statusFilter = document.getElementById('filter-status');
            const vendorFilter = document.getElementById('filter-vendor');
            const modalBranch = document.getElementById('branch');
            const modalStatus = document.getElementById('status');
            const modalVendor = document.getElementById('vendor');

            branchFilter.innerHTML = '<option value="">Todas las Sucursales</option>' + Object.entries(SUCURSALES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
            modalBranch.innerHTML = Object.entries(SUCURSALES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

            statusFilter.innerHTML = '<option value="">Todos los Estados</option>' + Object.entries(STATUSES).map(([k, {text}]) => `<option value="${k}">${text}</option>`).join('');
            modalStatus.innerHTML = Object.entries(STATUSES).map(([k, {text}]) => `<option value="${k}">${text}</option>`).join('');
            
            vendorFilter.innerHTML = '<option value="">Todos los Vendedores</option>' + VENDEDORES.map(v => `<option value="${v}">${v}</option>`).join('');
            modalVendor.innerHTML = VENDEDORES.map(v => `<option value="${v}">${v}</option>`).join('');
        }

        const modal = document.getElementById('envelope-modal');
        const modalTitle = document.getElementById('modal-title');
        const form = document.getElementById('envelope-form');
        const envelopeDbIdInput = document.getElementById('envelope-db-id');
        const clientMessageContainer = document.getElementById('client-message-container');
        const generateDescBtn = document.getElementById('generate-description-from-image-btn');
        const imagePreviewContainer = document.getElementById('image-preview');
        const deleteEnvelopeBtn = document.getElementById('delete-envelope-btn');


        function openModal(dbId = null) {
            form.reset();
            form.querySelectorAll('.form-input-error').forEach(el => el.classList.remove('form-input-error'));
            tempImageFilesData = [];
            existingEnvelopeImageUrls = []; // Reset for new/edit
            imagesToDeleteFromStorage = []; // Reset for new/edit
            imagePreviewContainer.innerHTML = '';
            generateDescBtn.disabled = true;

            document.getElementById('share-tracking-btn').style.display = 'none';
            deleteEnvelopeBtn.style.display = 'none'; // Hide delete button by default for new envelopes
            clientMessageContainer.classList.add('hidden');
            saveSuccessMessage.classList.add('hidden'); // Ensure success message is hidden when opening modal

            if (dbId) {
                const envelope = localEnvelopesCache.find(e => e.id === dbId);
                if (envelope) {
                    modalTitle.textContent = `Editar Sobre ${envelope.envelopeId}`;
                    document.getElementById('branch').value = envelope.branch;
                    document.getElementById('branch').disabled = true;
                    envelopeDbIdInput.value = envelope.id;
                    document.getElementById('client-name').value = envelope.clientName;
                    document.getElementById('client-contact').value = envelope.clientContact;
                    document.getElementById('item-description').value = envelope.itemDescription;
                    document.getElementById('work-description').value = envelope.workDescription;
                    document.getElementById('reception-date').value = envelope.receptionDate;
                    document.getElementById('delivery-date').value = envelope.deliveryDate;
                    document.getElementById('vendor').value = envelope.vendor;
                    document.getElementById('status').value = envelope.status;
                    document.getElementById('budget').value = envelope.budget;
                    document.getElementById('internal-notes').value = envelope.internalNotes;
                    document.getElementById('share-tracking-btn').style.display = 'inline-flex';
                    deleteEnvelopeBtn.style.display = 'inline-flex'; // Show delete button for existing envelopes
                    
                    if (envelope.imageDataUrls && envelope.imageDataUrls.length > 0) {
                        existingEnvelopeImageUrls = [...envelope.imageDataUrls]; // Populate existing URLs
                        renderImagePreviews(existingEnvelopeImageUrls); // Render existing images
                    }
                }
            } else {
                modalTitle.textContent = 'Nuevo Sobre';
                document.getElementById('branch').disabled = false;
                envelopeDbIdInput.value = '';
                document.getElementById('reception-date').value = new Date().toISOString().split('T')[0];
            }
            modal.classList.remove('hidden');
            document.body.classList.add('overflow-hidden');
        }

        function closeModal() {
            modal.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
        }
        
        function handleFormValidation(formElement) {
            formElement.querySelectorAll('.form-input-error').forEach(el => el.classList.remove('form-input-error'));
            if (!formElement.checkValidity()) {
                const firstInvalidField = formElement.querySelector('[required]:invalid');
                formElement.querySelectorAll('[required]:invalid').forEach(input => {
                    input.classList.add('form-input-error');
                });
                if (firstInvalidField) {
                    firstInvalidField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return false;
            }
            return true;
        }

        async function handleFormSubmit(event) {
            event.preventDefault();
            if (!handleFormValidation(form)) {
                console.log("Form validation failed.");
                return;
            }

            let dbId = envelopeDbIdInput.value;
            const loader = document.getElementById('loader');
            const loaderText = loader.querySelector('p');

            loader.classList.remove('hidden');
            loaderText.textContent = "Guardando sobre...";
            console.log("Starting handleFormSubmit...");

            try {
                // Step 1: Prepare the basic envelope data (without image URLs yet)
                let envelopeDataNoImages = {
                    branch: document.getElementById('branch').value,
                    clientName: document.getElementById('client-name').value,
                    clientContact: document.getElementById('client-contact').value,
                    itemDescription: document.getElementById('item-description').value,
                    workDescription: document.getElementById('work-description').value,
                    receptionDate: document.getElementById('reception-date').value,
                    deliveryDate: document.getElementById('delivery-date').value,
                    vendor: document.getElementById('vendor').value,
                    status: document.getElementById('status').value,
                    budget: parseFloat(document.getElementById('budget').value) || 0,
                    internalNotes: document.getElementById('internal-notes').value,
                    lastUpdated: new Date().toISOString()
                };

                let currentEnvelopeRef;

                if (dbId) {
                    // Existing envelope: update its data first
                    currentEnvelopeRef = doc(envelopesCollection, dbId);
                    await updateDoc(currentEnvelopeRef, envelopeDataNoImages);
                    console.log("Step 1a: Existing envelope data updated in Firestore with ID:", dbId);
                    loaderText.textContent = "Sobre actualizado, procesando imágenes...";
                } else {
                    // New envelope: add data first to get its ID
                    const branch = envelopeDataNoImages.branch;
                    const newIdYear = new Date().getFullYear();
                    const branchEnvelopes = localEnvelopesCache.filter(e => e.branch === branch && e.envelopeId && e.envelopeId.includes(String(newIdYear)));
                    const lastIdNum = branchEnvelopes.length > 0 ? Math.max(0, ...branchEnvelopes.map(e => parseInt(e.envelopeId.split('-')[2]))) : 0;
                    envelopeDataNoImages.envelopeId = `${branch}-${newIdYear}-${String(lastIdNum + 1).padStart(3, '0')}`;
                    envelopeDataNoImages.createdAt = new Date().toISOString();
                    
                    const newDocRef = await addDoc(envelopesCollection, envelopeDataNoImages);
                    dbId = newDocRef.id; // Get the newly generated ID
                    currentEnvelopeRef = newDocRef;
                    console.log("Step 1b: New envelope added to Firestore with ID:", dbId);
                    loaderText.textContent = "Nuevo sobre creado, subiendo imágenes...";
                }

                // Now that we have a dbId, process images for Storage
                // Start with images that were originally present and not removed (these are already Storage URLs)
                let currentImageUrlsInDb = [...existingEnvelopeImageUrls]; 
                console.log("Step 2: Initial existing image URLs for DB:", currentImageUrlsInDb);
                console.log("Images to delete from Storage:", imagesToDeleteFromStorage);


                // 1. Delete images marked for deletion from Firebase Storage
                for (const url of imagesToDeleteFromStorage) {
                    try {
                        const imageRef = ref(storage, url); 
                        await deleteObject(imageRef);
                        console.log("Step 2a: Deleted image from Storage:", url);
                    } catch (error) {
                        console.warn("Step 2a: Error deleting image from Storage (might not exist):", url, error);
                    }
                }
                console.log("Step 2b: Finished deleting old images.");


                // 2. Upload new images to Firebase Storage and collect their download URLs
                const newUploadedImageUrls = [];
                for (const item of tempImageFilesData) {
                    const file = item.file;
                    const imagePath = `artifacts/${appId}/images/${dbId}/${file.name}`; 
                    const imageRef = ref(storage, imagePath);
                    const snapshot = await uploadBytes(imageRef, file);
                    const downloadURL = await getDownloadURL(snapshot.ref);
                    newUploadedImageUrls.push(downloadURL); // Collect the actual download URL
                    console.log("Step 3: Uploaded new image to Storage:", downloadURL);
                }
                console.log("Step 4: Finished uploading new images. New URLs:", newUploadedImageUrls);


                // 3. Combine existing (not deleted) URLs with newly uploaded URLs
                const finalImageUrlsForDb = [...currentImageUrlsInDb, ...newUploadedImageUrls];
                console.log("Step 5: Final image URLs for DB update:", finalImageUrlsForDb);

                // 4. Update the envelope in Firestore with the final list of Storage image URLs
                await updateDoc(currentEnvelopeRef, { imageDataUrls: finalImageUrlsForDb });
                console.log("Step 6: Envelope updated with final image URLs in Firestore:", dbId);
                
                // --- PUNTO DE INTERRUPCIÓN PARA DEPURACIÓN ---
                debugger; // El navegador se pausará aquí. ¡Observa la consola y los elementos HTML!
                // --- FIN PUNTO DE INTERRUPCIÓN ---

                showSaveSuccessMessage(); // Muestra el mensaje de éxito
                console.log("Attempting to close modal..."); // Log para depuración
                closeModal(); // Cierra el modal
                console.log("handleFormSubmit completed successfully.");

            } catch (error) {
                console.error("Error during form submission: ", error);
                // Intenta mostrar el error de Firebase de una manera más amigable
                let errorMessage = "Ocurrió un error al guardar el sobre.";
                if (error.code) { // Firebase errors usually have a 'code' property
                    errorMessage += ` Código: ${error.code}. Mensaje: ${error.message}`;
                } else {
                    errorMessage += ` Mensaje: ${error.message}`;
                }
                showAuthError(loginErrorMessage, errorMessage);
                console.log("handleFormSubmit caught an error.");
            } finally {
                loader.classList.add('hidden');
                loader.querySelector('p').textContent = 'Conectando con la base de datos...';
                // Reset temp image data and deletion list after successful submission or failure
                tempImageFilesData = [];
                existingEnvelopeImageUrls = [];
                imagesToDeleteFromStorage = [];
            }
        }


        document.getElementById('image-upload-input').addEventListener('change', (event) => {
            const files = Array.from(event.target.files);
            
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    tempImageFilesData.push({ dataUrl: e.target.result, file: file });
                    renderImagePreviews([e.target.result], true); // Pass true for new images
                };
                reader.readAsDataURL(file);
            });
            
            if(files.length > 0) {
              generateDescBtn.disabled = false;
            }
        });

        // A flag `isNew` helps determine if it's a new image (base64 for preview) or existing (URL from Storage)
        function renderImagePreviews(urls, isNew = false) {
            urls.forEach(url => {
                const previewItem = `
                    <div class="image-preview-item">
                        <img src="${url}" alt="Vista previa de imagen">
                        <button type="button" class="remove-image-btn p-1" data-url="${url}" data-is-new="${isNew}">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-red-500 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>
                        </button>
                    </div>`;
                imagePreviewContainer.insertAdjacentHTML('beforeend', previewItem);
            });
        }
        
        imagePreviewContainer.addEventListener('click', (event) => {
            const removeBtn = event.target.closest('.remove-image-btn');
            if (removeBtn) {
                const previewItem = removeBtn.closest('.image-preview-item');
                const urlToRemove = removeBtn.dataset.url;
                const isNewImage = removeBtn.dataset.isNew === 'true'; // Get the flag

                if (isNewImage) {
                    // Remove from tempImageFilesData (base64)
                    const fileIndex = tempImageFilesData.findIndex(item => item.dataUrl === urlToRemove);
                    if (fileIndex > -1) {
                        tempImageFilesData.splice(fileIndex, 1);
                    }
                } else {
                    // This is an existing image (Firebase Storage URL), mark for deletion
                    imagesToDeleteFromStorage.push(urlToRemove);
                    // Also remove it from our in-memory list of existing images
                    const existingIndex = existingEnvelopeImageUrls.indexOf(urlToRemove);
                    if (existingIndex > -1) {
                        existingEnvelopeImageUrls.splice(existingIndex, 1);
                    }
                }

                previewItem.remove();

                // Update generateDescBtn disabled state based on remaining images
                if (imagePreviewContainer.children.length === 0) {
                    generateDescBtn.disabled = true;
                }
            }
        });

        const receiptModal = document.getElementById('receipt-modal');
        function closeReceiptModal() {
            receiptModal.classList.add('hidden');
        }
        
        document.getElementById('generate-receipt-btn').addEventListener('click', () => {
            if (!handleFormValidation(form)) return;
            const dbId = document.getElementById('envelope-db-id').value;
            const envelope = localEnvelopesCache.find(e => e.id === dbId) || {};

            const branchKey = document.getElementById('branch').value;
            document.getElementById('receipt-envelope-id').textContent = envelope.envelopeId || `(Nuevo)`;
            document.getElementById('receipt-branch').textContent = SUCURSALES[branchKey];
            document.getElementById('receipt-reception-date').textContent = formatDate(document.getElementById('reception-date').value);
            document.getElementById('receipt-delivery-date').textContent = formatDate(document.getElementById('delivery-date').value);
            document.getElementById('receipt-client-name').textContent = document.getElementById('client-name').value;
            document.getElementById('receipt-client-contact').textContent = document.getElementById('client-contact').value;
            document.getElementById('receipt-item-description').textContent = document.getElementById('item-description').value;
            document.getElementById('receipt-work-description').textContent = document.getElementById('work-description').value;
            const budget = parseFloat(document.getElementById('budget').value) || 0;
            document.getElementById('receipt-budget').textContent = `$ ${budget.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            receiptModal.classList.remove('hidden');
        });

        document.getElementById('close-receipt-btn').addEventListener('click', closeReceiptModal);
        document.getElementById('print-receipt-btn').addEventListener('click', () => {
            window.print();
        });

        // Function to delete a folder (all files within) in Firebase Storage
        async function deleteFolderContents(folderRef) {
            const listResult = await listAll(folderRef);
            const deletePromises = listResult.items.map(itemRef => deleteObject(itemRef));
            // Recursively delete subfolders (if any, though in this design we expect flat structure per envelope)
            const deleteFolderPromises = listResult.prefixes.map(prefixRef => deleteFolderContents(prefixRef));
            await Promise.all([...deletePromises, ...deleteFolderPromises]);
        }

        document.getElementById('delete-envelope-btn').addEventListener('click', async () => {
            const dbId = envelopeDbIdInput.value;
            if (!dbId) {
                showAuthError(loginErrorMessage, "No hay sobre seleccionado para eliminar.");
                return;
            }

            // Custom confirmation dialog instead of alert/confirm
            const confirmation = window.confirm("¿Estás seguro de que quieres eliminar este sobre? Esta acción es irreversible y también eliminará las imágenes asociadas y el registro de seguimiento público."); // Simplified for brevity, use a custom modal for production

            if (!confirmation) {
                return;
            }

            const loader = document.getElementById('loader');
            loader.classList.remove('hidden');
            loader.querySelector('p').textContent = "Eliminando sobre y archivos asociados...";

            try {
                // 1. Delete the document from the user's private Firestore collection
                await deleteDoc(doc(envelopesCollection, dbId));
                console.log("Envelope deleted from private collection:", dbId);

                // 2. Delete the corresponding public tracking document from Firestore (if it exists)
                const envelopeToDelete = localEnvelopesCache.find(e => e.id === dbId);
                if (envelopeToDelete && envelopeToDelete.envelopeId) {
                    const publicDocRef = doc(db, `/artifacts/${appId}/public/data/envelopes`, envelopeToDelete.envelopeId);
                    await deleteDoc(publicDocRef);
                    console.log("Envelope deleted from public tracking collection:", envelopeToDelete.envelopeId);
                }

                // 3. Delete associated images from Firebase Storage
                const imageFolderRef = ref(storage, `artifacts/${appId}/images/${dbId}`);
                await deleteFolderContents(imageFolderRef);
                console.log("Associated images deleted from Storage for envelope:", dbId);

                closeModal(); // Close the modal after successful deletion
                // The onSnapshot listener will automatically update the UI

            } catch (error) {
                console.error("Error deleting envelope:", error);
                showAuthError(loginErrorMessage, `Error al eliminar el sobre: ${error.message}`);
            } finally {
                loader.classList.add('hidden');
                loader.querySelector('p').textContent = 'Conectando con la base de datos...';
            }
        });


        // Modified: share-tracking-btn now redirects to tracking view
        document.getElementById('share-tracking-btn').addEventListener('click', async () => { 
            const dbId = document.getElementById('envelope-db-id').value;
            if (!dbId) {
                showAuthError(loginErrorMessage, 'Por favor, guarda el sobre antes de ver el seguimiento.');
                return;
            }
            const envelope = localEnvelopesCache.find(e => e.id === dbId);
            if (!envelope) {
                showAuthError(loginErrorMessage, 'Sobre no encontrado en la caché local.');
                return;
            }

            const loader = document.getElementById('loader');
            loader.classList.remove('hidden');
            loader.querySelector('p').textContent = 'Redirigiendo a la vista de seguimiento...';

            try {
                // Ensure the envelope is public for tracking
                const publicEnvelopeData = {
                    envelopeId: envelope.envelopeId,
                    clientName: envelope.clientName,
                    itemDescription: envelope.itemDescription,
                    workDescription: envelope.workDescription,
                    status: envelope.status,
                    lastUpdated: new Date().toISOString(),
                    ownerUid: userId 
                };
                const publicDocRef = doc(db, `/artifacts/${appId}/public/data/envelopes`, envelope.envelopeId);
                await setDoc(publicDocRef, publicEnvelopeData, { merge: true }); // Update or create public record

                const trackingUrl = `${window.location.origin}${window.location.pathname}#track/${envelope.envelopeId}`;
                window.location.hash = `track/${envelope.envelopeId}`; // Change URL hash to trigger tracking view
                closeModal(); // Close the main modal

            } catch (error) {
                console.error("Error preparing for tracking redirection:", error);
                showAuthError(loginErrorMessage, `Error al preparar seguimiento: ${error.message}`);
            } finally {
                loader.classList.add('hidden');
                loader.querySelector('p').textContent = 'Conectando con la base de datos...';
            }
        });

        // New: Copy link button in customer tracking view
        customerCopyLinkBtn.addEventListener('click', (e) => {
            customerShareLinkInput.select();
            document.execCommand('copy');
            e.target.textContent = '¡Copiado!';
            setTimeout(() => { e.target.textContent = 'Copiar Enlace' }, 2000);
        });
        
        document.getElementById('exit-tracking-view').addEventListener('click', (e) => {
            e.preventDefault();
            // Asegura que la URL no tenga el hash de seguimiento para volver a la app principal
            history.pushState("", document.title, window.location.pathname + window.location.search);
            showMainApp();
        });
        
        async function showTrackingPage(envelopeId) {
            clearAuthErrors(); // Clear all error messages when entering tracking page
            const appDiv = document.getElementById('app');
            const trackingView = document.getElementById('customer-tracking-view');
            appDiv.classList.add('hidden');
            trackingView.classList.add('hidden');
            customerShareLinkContainer.classList.add('hidden'); // Ocultar el contenedor de enlace de seguimiento por defecto

            const loader = document.getElementById('loader');
            loader.classList.remove('hidden');
            loader.querySelector('p').textContent = 'Buscando sobre...';

            console.log(`[showTrackingPage] Buscando sobre ID: ${envelopeId} en la colección pública: /artifacts/${appId}/public/data/envelopes`);
            // Query the public collection for tracking links
            const docRef = doc(db, `/artifacts/${appId}/public/data/envelopes`, envelopeId);
            
            try {
                const docSnap = await getDoc(docRef); // Fetch a single document by its ID
                
                loader.classList.add('hidden');

                if (!docSnap.exists()) { // Check if the document exists
                    console.log(`[showTrackingPage] Sobre con ID ${envelopeId} NO encontrado en la colección pública.`);
                    showTrackingError('Sobre no encontrado para seguimiento. Asegúrese de que el enlace sea correcto y que el sobre se haya compartido públicamente.'); 
                    trackingView.classList.remove('hidden'); // Muestra la vista de seguimiento con el error
                    return;
                }

                const envelope = docSnap.data(); // Get the data directly
                console.log(`[showTrackingPage] Sobre encontrado:`, envelope);

                document.getElementById('tracking-id').textContent = envelope.envelopeId;
                const statusInfo = STATUSES[envelope.status];
                const statusBadge = document.getElementById('tracking-status-badge');
                statusBadge.textContent = statusInfo.text;
                statusBadge.className = `mt-2 text-xl font-bold p-3 rounded-lg text-center ${statusInfo.color} ${statusInfo.textColor}`;
                document.getElementById('tracking-item').textContent = envelope.itemDescription;
                document.getElementById('tracking-work').textContent = envelope.workDescription;

                // Display the shareable link in the customer tracking view
                const trackingUrl = `${window.location.origin}${window.location.pathname}#track/${envelope.envelopeId}`;
                customerShareLinkInput.value = trackingUrl;
                customerShareLinkContainer.classList.remove('hidden'); // Mostrar el contenedor de enlace de seguimiento

                trackingView.classList.remove('hidden'); // Mostrar la vista de seguimiento con los datos
                console.log("[showTrackingPage] Vista de seguimiento mostrada correctamente.");

            } catch (error) {
                console.error("[showTrackingPage] Error al obtener el sobre público:", error);
                showTrackingError(`Error al cargar el seguimiento: ${error.message}.`);
                loader.classList.add('hidden');
                trackingView.classList.remove('hidden'); // Muestra la vista de seguimiento con el error
            }
        }
        
        function showMainApp() {
            document.getElementById('app').classList.remove('hidden');
            document.getElementById('customer-tracking-view').classList.add('hidden');
        }

        function checkUrlForTracking() {
            const hash = window.location.hash;
            if (hash.startsWith('#track/')) {
                const envelopeId = hash.substring(7);
                showTrackingPage(envelopeId);
            }
        }
        
        // --- Gemini Feature Event Listeners ---
        generateDescBtn.addEventListener('click', async (e) => {
            if (tempImageFilesData.length === 0) {
                showAuthError(loginErrorMessage, "Por favor, suba una imagen primero."); 
                return;
            }

            // For Gemini API, we use the Base64 representation of the image
            const firstFile = tempImageFilesData[0].file;
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64String = event.target.result.split(',')[1];
                const mimeType = firstFile.type;
                const prompt = "Actúa como un tasador y descriptor experto de joyas. Describe el artículo en la imagen de forma concisa pero detallada, mencionando el tipo de joya, material aparente, gemas (si las hay), y cualquier detalle relevante. La descripción debe ser adecuada para una ficha de taller en español.";
                const description = await callGeminiAPI(prompt, e.target, { mimeType, data: base64String });
                if (description) {
                    document.getElementById('item-description').value = description;
                }
            };
            reader.readAsDataURL(firstFile);
        });
        
        document.getElementById('generate-technical-notes-btn').addEventListener('click', async (e) => {
            const itemDesc = document.getElementById('item-description').value;
            const workDesc = document.getElementById('work-description').value;
            if (!itemDesc || !workDesc) {
                showAuthError(loginErrorMessage, "Por favor, complete la 'Descripción del Artículo' y el 'Trabajo a Realizar' antes de generar las notas."); 
                return;
            }
            const prompt = `Eres un experto joyero. Basado en la siguiente información, detalla los pasos técnicos necesarios para realizar el trabajo. Responde con una lista numerada concisa en español. Artículo: '${itemDesc}'. Trabajo solicitado: '${workDesc}'.`;
            const suggestedNotes = await callGeminiAPI(prompt, e.target);
            if (suggestedNotes) {
                document.getElementById('internal-notes').value = suggestedNotes;
            }
        });

        document.getElementById('generate-client-message-btn').addEventListener('click', async (e) => {
            const clientName = document.getElementById('client-name').value;
            const itemDesc = document.getElementById('item-description').value;
            const statusKey = document.getElementById('status').value;
            const statusText = STATUSES[statusKey]?.text || 'actualizado';

            if (!clientName || !itemDesc) {
                showAuthError(loginErrorMessage, "Por favor, complete el 'Nombre del Cliente' y la 'Descripción del Artículo'."); 
                return;
            }

            const prompt = `Actúa como un asistente de una joyería. Escribe un mensaje de WhatsApp corto, amigable y profesional para un cliente en español. El mensaje debe informar sobre el estado de su reparación. Usa la siguiente información: Nombre del cliente: '${clientName}', Artículo: '${itemDesc}', Nuevo estado: '${statusText}'. Incluye un saludo y una despedida cordial.`;
            const suggestedMessage = await callGeminiAPI(prompt, e.target);
            if (suggestedMessage) {
                const messageOutput = document.getElementById('client-message-output');
                messageOutput.value = suggestedMessage;
                clientMessageContainer.classList.remove('hidden');
            }
        });
        
        document.getElementById('copy-client-message-btn').addEventListener('click', (e) => {
            const messageOutput = document.getElementById('client-message-output');
            messageOutput.select();
            document.execCommand('copy');
            e.target.textContent = '¡Copiado!';
            setTimeout(() => { e.target.textContent = 'Copiar Enlace' }, 2000);
        });

        window.addEventListener('hashchange', checkUrlForTracking);
        document.getElementById('add-new-btn').addEventListener('click', () => openModal());
        document.getElementById('close-modal-btn').addEventListener('click', closeModal);
        document.getElementById('cancel-btn').addEventListener('click', closeModal);
        
        modal.addEventListener('click', (e) => { 
            if (e.target === modal) {
                closeModal();
            }
        });

        receiptModal.addEventListener('click', (e) => { if(e.target === receiptModal) closeReceiptModal() });
        form.addEventListener('submit', handleFormSubmit);

        document.getElementById('search-input').addEventListener('input', renderEnvelopeList);
        document.getElementById('filter-status').addEventListener('change', renderEnvelopeList);
        document.getElementById('filter-vendor').addEventListener('change', renderEnvelopeList);
        document.getElementById('filter-branch').addEventListener('change', renderEnvelopeList);
        
        document.getElementById('prev-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); });
        document.getElementById('next-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); });
        
        // Auth form submissions
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            clearAuthErrors(); 
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            loader.classList.remove('hidden');
            loader.querySelector('p').textContent = 'Iniciando sesión...';
            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                let errorMessage = 'Error al iniciar sesión.';
                switch (error.code) {
                    case 'auth/invalid-email':
                        errorMessage = 'El formato del correo electrónico es inválido.';
                        break;
                    case 'auth/user-disabled':
                        errorMessage = 'El usuario ha sido deshabilitado.';
                        break;
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                        errorMessage = 'Credenciales incorrectas.';
                        break;
                    case 'auth/too-many-requests':
                        errorMessage = 'Demasiados intentos fallidos. Intente de nuevo más tarde.';
                        break;
                    default:
                        errorMessage = `Error desconocido: ${error.message}`;
                        break;
                }
                showAuthError(loginErrorMessage, errorMessage);
            } finally {
                loader.classList.add('hidden');
                loader.querySelector('p').textContent = 'Conectando con la base de datos...';
            }
        });
        
        document.getElementById('logout-btn').addEventListener('click', async () => {
            try {
                await signOut(auth);
            } catch (error) {
                showAuthError(loginErrorMessage, `Error al cerrar sesión: ${error.message}`); 
            }
        });

        // Initialize filters and check URL on load
        populateFilters();
        checkUrlForTracking();
    