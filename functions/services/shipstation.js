const axios = require("axios");
const functions = require("firebase-functions");

/**
 * Helper function to create a shipping label using the ShipStation API.
 */
async function createShipStationLabel(fromAddress, toAddress, carrierCode, serviceCode, packageCode = "package", weightInOunces = 8, testLabel = false) {
    const shipstationApiKey = functions.config().shipstation.key;
    const shipstationApiSecret = functions.config().shipstation.secret;
    
    if (!shipstationApiKey || !shipstationApiSecret) {
        throw new Error("ShipStation API credentials not configured. Please set 'shipstation.key' and 'shipstation.secret' environment variables.");
    }
    
    const authHeader = `Basic ${Buffer.from(`${shipstationApiKey}:${shipstationApiSecret}`).toString('base64')}`;
    const today = new Date().toISOString().split('T')[0];

    const payload = {
        carrierCode: carrierCode,
        serviceCode: serviceCode,
        packageCode: packageCode,
        shipDate: today,
        weight: {
            value: weightInOunces,
            units: "ounces"
        },
        shipFrom: fromAddress,
        shipTo: toAddress,
        testLabel: testLabel
    };

    try {
        const response = await axios.post("https://ssapi.shipstation.com/shipments/createlabel", payload, {
            headers: {
                "Authorization": authHeader,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            timeout: 30000 // Add a 30-second timeout to prevent the function from hanging indefinitely
        });
        return response.data;
    } catch (error) {
        console.error("Error creating ShipStation label:", error.response?.data || error.message);
        throw new Error(`Failed to create ShipStation label: ${error.response?.data?.ExceptionMessage || error.message}`);
    }
}

module.exports = { createShipStationLabel };
