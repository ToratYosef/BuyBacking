const BACKEND_URL = 'https://us-central1-buyback-a0f05.cloudfunctions.net/api';
        const urlParams = new URLSearchParams(window.location.search);
        const orderId = urlParams.get('orderId');

        const pdfFrame = document.getElementById('pdfFrame');
        const statusText = document.getElementById('statusText');
        const orderSummary = document.getElementById('orderSummary');
        const outboundLabelLink = document.getElementById('outboundLabelLink');
        const syncTrackingBtn = document.getElementById('syncTrackingBtn');
        const printBundleBtn = document.getElementById('printBundleBtn');
        const errorPanel = document.getElementById('errorPanel');
        const errorMessage = document.getElementById('errorMessage');
        const retryBtn = document.getElementById('retryBtn');

        let latestOrder = null;
        let printHasRun = false;
        let printReady = false;
        let currentBundleUrl = null;
        let handlingAfterPrint = false;

        if (!orderId) {
            showError('Missing orderId query parameter.');
            setStatus('Missing order');
        } else {
            bootstrap();
        }

        retryBtn.addEventListener('click', () => {
            clearError();
            bootstrap();
        });

        printBundleBtn.addEventListener('click', () => {
            if (printReady) {
                requestPrint(false);
            }
        });

        syncTrackingBtn.addEventListener('click', async () => {
            if (!latestOrder) return;
            toggleSyncButton(true);
            try {
                const response = await fetch(`${BACKEND_URL}/orders/${latestOrder.id}/sync-outbound-tracking`, {
                    method: 'POST',
                });
                if (!response.ok) {
                    throw new Error(`Sync failed (${response.status})`);
                }
                const payload = await response.json();
                updateOrderSummary(payload.tracking, payload.status);
                setStatus('Tracking refreshed');
            } catch (error) {
                console.error('Tracking sync failed:', error);
                alert('Unable to sync tracking. Please try again later.');
            } finally {
                toggleSyncButton(false);
            }
        });

        window.addEventListener('afterprint', handleAfterPrint);
        window.addEventListener('beforeunload', () => {
            if (currentBundleUrl) {
                URL.revokeObjectURL(currentBundleUrl);
            }
        });

        async function bootstrap() {
            try {
                setStatus('Loading order…');
                pdfFrame.hidden = true;
                printReady = false;
                latestOrder = await fetchOrder(orderId);
                updateOrderSummary(null, latestOrder.status);
                await hydrateOutboundLabel(latestOrder);
                await loadPrintBundle(orderId);
            } catch (error) {
                console.error('Failed to initialise print page:', error);
                showError(error.message || 'Unable to load documents.');
            }
        }

        async function fetchOrder(id) {
            const response = await fetch(`${BACKEND_URL}/orders/${encodeURIComponent(id)}`);
            if (!response.ok) {
                throw new Error(`Failed to load order (${response.status})`);
            }
            return response.json();
        }

        async function hydrateOutboundLabel(order) {
            if (order.outboundLabelUrl) {
                outboundLabelLink.hidden = false;
                outboundLabelLink.href = order.outboundLabelUrl;
                syncTrackingBtn.hidden = false;
            } else {
                outboundLabelLink.hidden = true;
                outboundLabelLink.removeAttribute('href');
                syncTrackingBtn.hidden = true;
            }
        }

        async function loadPrintBundle(id) {
            setStatus('Preparing documents…');
            setPrintButtonState(false);
            clearError();
            printReady = false;

            if (currentBundleUrl) {
                URL.revokeObjectURL(currentBundleUrl);
                currentBundleUrl = null;
            }

            const response = await fetch(`${BACKEND_URL}/print-bundle/${encodeURIComponent(id)}`);
            if (!response.ok) {
                throw new Error(`Print bundle failed to generate (${response.status})`);
            }

            const blob = await response.blob();
            currentBundleUrl = URL.createObjectURL(blob);
            pdfFrame.src = currentBundleUrl;
            pdfFrame.hidden = false;

            const onLoad = () => {
                pdfFrame.removeEventListener('load', onLoad);
                attachFrameAfterPrint();
                printReady = true;
                setPrintButtonState(true);
                setStatus('Ready to print');
                if (!printHasRun) {
                    requestPrint(true);
                }
            };

            pdfFrame.addEventListener('load', onLoad, { once: true });
        }

        function requestPrint(auto = false) {
            if (!printReady) return;
            if (auto && printHasRun) return;
            if (auto) {
                printHasRun = true;
            }
            setStatus('Opening print dialog…');
            const frameWindow = pdfFrame.contentWindow;
            if (frameWindow && typeof frameWindow.print === 'function') {
                frameWindow.focus();
                frameWindow.print();
            } else {
                window.print();
            }
        }

        async function handleAfterPrint() {
            if (handlingAfterPrint) return;
            handlingAfterPrint = true;
            try {
                if (shouldMarkKitSent()) {
                    await markKitAsSent();
                } else if (latestOrder) {
                    updateOrderSummary(null, latestOrder.status);
                    setStatus('Print complete');
                }
            } catch (error) {
                console.error('Failed to handle post-print updates:', error);
                setStatus('Printed — update status manually');
            } finally {
                setTimeout(() => window.close(), 600);
                handlingAfterPrint = false;
            }
        }

        async function markKitAsSent() {
            try {
                setStatus('Marking kit as sent…');
                const response = await fetch(`${BACKEND_URL}/orders/${encodeURIComponent(latestOrder.id)}/mark-kit-sent`, {
                    method: 'POST',
                });
                if (!response.ok) {
                    throw new Error(`Failed with status ${response.status}`);
                }
                latestOrder.status = 'kit_sent';
                updateOrderSummary(null, latestOrder.status);
                setStatus('Kit marked as sent');
            } catch (error) {
                console.error('Failed to mark kit sent:', error);
                setStatus('Printed — update status manually');
            }
        }

        function shouldMarkKitSent() {
            if (!latestOrder) return false;
            if (latestOrder.shippingPreference !== 'Shipping Kit Requested') return false;
            return ['needs_printing', 'kit_needs_printing', 'shipping_kit_requested'].includes(latestOrder.status);
        }

        function updateOrderSummary(trackingData, statusOverride) {
            if (!latestOrder) return;
            if (statusOverride) {
                latestOrder.status = statusOverride;
            }
            const status = latestOrder.status;
            const trackingLine = trackingData?.status_description || trackingData?.statusDescription || '';
            const summaryParts = [`<strong>Order #${latestOrder.id}</strong>`];
            if (status) {
                summaryParts.push(`Status: ${formatStatus(status)}`);
            }
            if (latestOrder.device) {
                summaryParts.push(`${latestOrder.device}${latestOrder.storage ? ` (${latestOrder.storage})` : ''}`);
            }
            if (latestOrder.outboundTrackingNumber) {
                summaryParts.push(`Outbound tracking: <a href="https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${latestOrder.outboundTrackingNumber}" target="_blank" rel="noopener">${latestOrder.outboundTrackingNumber}</a>`);
            }
            if (trackingLine) {
                summaryParts.push(trackingLine);
            }
            orderSummary.innerHTML = summaryParts.join(' · ');
        }

        function formatStatus(status) {
            if (!status) return 'Status unavailable';
            const labels = {
                shipping_kit_requested: 'Needs Printing',
                needs_printing: 'Needs Printing',
                kit_needs_printing: 'Needs Printing',
                kit_sent: 'Kit Sent',
                kit_in_transit: 'Kit In Transit',
                kit_delivered: 'Kit Delivered',
                label_generated: 'Label Generated',
                order_pending: 'Order Pending',
            };
            return labels[status] || status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        }

        function showError(message) {
            setStatus('Unable to load documents');
            orderSummary.textContent = '';
            errorMessage.textContent = message;
            errorPanel.hidden = false;
            pdfFrame.hidden = true;
            setPrintButtonState(false, true);
        }

        function clearError() {
            errorPanel.hidden = true;
        }

        function toggleSyncButton(disabled) {
            syncTrackingBtn.disabled = disabled;
            if (disabled) {
                syncTrackingBtn.textContent = 'Syncing…';
            } else {
                syncTrackingBtn.textContent = 'Sync Tracking';
            }
        }

        function setPrintButtonState(enabled, isError = false) {
            if (isError) {
                printBundleBtn.disabled = true;
                printBundleBtn.textContent = 'Unavailable';
                return;
            }

            printBundleBtn.disabled = !enabled;
            printBundleBtn.textContent = enabled ? 'Print Documents' : 'Preparing…';
        }

        function setStatus(text) {
            statusText.textContent = text;
        }

        function attachFrameAfterPrint() {
            const frameWindow = pdfFrame.contentWindow;
            if (!frameWindow) return;
            frameWindow.removeEventListener('afterprint', handleAfterPrint);
            frameWindow.addEventListener('afterprint', handleAfterPrint);
        }
