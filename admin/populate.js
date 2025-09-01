import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' assert { type: "json" };

// Initialize the Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Device data for iPad models.
const deviceData = {
    ipads: [
        {
            name: 'iPad Pro M4 13-inch', slug: 'ipad-pro-m4-13-inch', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/ipad/assets/ipad-pro-m4-13-inch',
            prices: {
                '256GB': { 'lte': { flawless: 1000, good: 980, fair: 960, damaged: 920, broken: 750, noPower: 500 }, 'wifi': { flawless: 950, good: 930, fair: 910, damaged: 870, broken: 700, noPower: 450 } },
                '512GB': { 'lte': { flawless: 1200, good: 1180, fair: 1160, damaged: 1120, broken: 950, noPower: 700 }, 'wifi': { flawless: 1150, good: 1130, fair: 1110, damaged: 1070, broken: 900, noPower: 650 } },
                '1TB': { 'lte': { flawless: 1600, good: 1580, fair: 1560, damaged: 1520, broken: 1350, noPower: 1100 }, 'wifi': { flawless: 1550, good: 1530, fair: 1510, damaged: 1470, broken: 1300, noPower: 1050 } },
                '2TB': { 'lte': { flawless: 1900, good: 1880, fair: 1860, damaged: 1820, broken: 1650, noPower: 1400 }, 'wifi': { flawless: 1850, good: 1830, fair: 1810, damaged: 1770, broken: 1600, noPower: 1350 } }
            }
        },
        {
            name: 'iPad Pro M4 11-inch', slug: 'ipad-pro-m4-11-inch', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/ipad/assets/ipad-pro-m4-11-inch',
            prices: {
                '256GB': { 'lte': { flawless: 850, good: 830, fair: 810, damaged: 770, broken: 600, noPower: 350 }, 'wifi': { flawless: 800, good: 780, fair: 760, damaged: 720, broken: 550, noPower: 300 } },
                '512GB': { 'lte': { flawless: 1050, good: 1030, fair: 1010, damaged: 970, broken: 800, noPower: 550 }, 'wifi': { flawless: 1000, good: 980, fair: 960, damaged: 920, broken: 750, noPower: 500 } },
                '1TB': { 'lte': { flawless: 1450, good: 1430, fair: 1410, damaged: 1370, broken: 1200, noPower: 950 }, 'wifi': { flawless: 1400, good: 1380, fair: 1360, damaged: 1320, broken: 1150, noPower: 900 } },
                '2TB': { 'lte': { flawless: 1750, good: 1730, fair: 1710, damaged: 1670, broken: 1500, noPower: 1250 }, 'wifi': { flawless: 1700, good: 1680, fair: 1660, damaged: 1620, broken: 1450, noPower: 1200 } }
            }
        },
        {
            name: 'iPad Air M3 13-inch', slug: 'ipad-air-m3-13-inch', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/ipad/assets/ipad-air-m3-13-inch',
            prices: {
                '128GB': { 'lte': { flawless: 650, good: 630, fair: 610, damaged: 570, broken: 400, noPower: 200 }, 'wifi': { flawless: 600, good: 580, fair: 560, damaged: 520, broken: 350, noPower: 150 } },
                '256GB': { 'lte': { flawless: 750, good: 730, fair: 710, damaged: 670, broken: 500, noPower: 300 }, 'wifi': { flawless: 700, good: 680, fair: 660, damaged: 620, broken: 450, noPower: 250 } },
                '512GB': { 'lte': { flawless: 900, good: 880, fair: 860, damaged: 820, broken: 650, noPower: 450 }, 'wifi': { flawless: 850, good: 830, fair: 810, damaged: 770, broken: 600, noPower: 400 } },
                '1TB': { 'lte': { flawless: 1050, good: 1030, fair: 1010, damaged: 970, broken: 800, noPower: 600 }, 'wifi': { flawless: 1000, good: 980, fair: 960, damaged: 920, broken: 750, noPower: 550 } }
            }
        },
        {
            name: 'iPad Air M3 11-inch', slug: 'ipad-air-m3-11-inch', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/ipad/assets/ipad-air-m3-11-inch',
            prices: {
                '128GB': { 'lte': { flawless: 550, good: 530, fair: 510, damaged: 470, broken: 300, noPower: 100 }, 'wifi': { flawless: 500, good: 480, fair: 460, damaged: 420, broken: 250, noPower: 50 } },
                '256GB': { 'lte': { flawless: 650, good: 630, fair: 610, damaged: 570, broken: 400, noPower: 200 }, 'wifi': { flawless: 600, good: 580, fair: 560, damaged: 520, broken: 350, noPower: 150 } },
                '512GB': { 'lte': { flawless: 800, good: 780, fair: 760, damaged: 720, broken: 550, noPower: 350 }, 'wifi': { flawless: 750, good: 730, fair: 710, damaged: 670, broken: 500, noPower: 300 } },
                '1TB': { 'lte': { flawless: 950, good: 930, fair: 910, damaged: 870, broken: 700, noPower: 500 }, 'wifi': { flawless: 900, good: 880, fair: 860, damaged: 820, broken: 650, noPower: 450 } }
            }
        },
        {
            name: 'iPad 11th Gen', slug: 'ipad-11th-gen', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/ipad/assets/ipad-11th-gen',
            prices: {
                '64GB': { 'lte': { flawless: 400, good: 380, fair: 360, damaged: 320, broken: 150, noPower: 50 }, 'wifi': { flawless: 350, good: 330, fair: 310, damaged: 270, broken: 100, noPower: 25 } },
                '256GB': { 'lte': { flawless: 500, good: 480, fair: 460, damaged: 420, broken: 250, noPower: 100 }, 'wifi': { flawless: 450, good: 430, fair: 410, damaged: 370, broken: 200, noPower: 75 } }
            }
        },
        {
            name: 'iPad 10th Gen', slug: 'ipad-10th-gen', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/ipad/assets/ipad-10th-gen',
            prices: {
                '64GB': { 'lte': { flawless: 300, good: 280, fair: 260, damaged: 220, broken: 100, noPower: 0 }, 'wifi': { flawless: 250, good: 230, fair: 210, damaged: 170, broken: 50, noPower: 0 } },
                '256GB': { 'lte': { flawless: 400, good: 380, fair: 360, damaged: 320, broken: 200, noPower: 50 }, 'wifi': { flawless: 350, good: 330, fair: 310, damaged: 270, broken: 150, noPower: 25 } }
            }
        },
        {
            name: 'iPad 9th Gen', slug: 'ipad-9th-gen', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/ipad/assets/ipad-9th-gen',
            prices: {
                '64GB': { 'lte': { flawless: 250, good: 230, fair: 210, damaged: 170, broken: 50, noPower: 0 }, 'wifi': { flawless: 200, good: 180, fair: 160, damaged: 120, broken: 0, noPower: 0 } },
                '256GB': { 'lte': { flawless: 350, good: 330, fair: 310, damaged: 270, broken: 150, noPower: 25 }, 'wifi': { flawless: 300, good: 280, fair: 260, damaged: 220, broken: 100, noPower: 0 } }
            }
        },
        {
            name: 'iPad mini 7th Gen', slug: 'ipad-mini-7th-gen', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/ipad/assets/ipad-mini-7th-gen',
            prices: {
                '128GB': { 'lte': { flawless: 500, good: 480, fair: 460, damaged: 420, broken: 250, noPower: 100 }, 'wifi': { flawless: 450, good: 430, fair: 410, damaged: 370, broken: 200, noPower: 75 } },
                '256GB': { 'lte': { flawless: 600, good: 580, fair: 560, damaged: 520, broken: 350, noPower: 150 }, 'wifi': { flawless: 550, good: 530, fair: 510, damaged: 470, broken: 300, noPower: 125 } }
            }
        },
        {
            name: 'iPad mini 6th Gen', slug: 'ipad-mini-6th-gen', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/ipad/assets/ipad-mini-6th-gen',
            prices: {
                '64GB': { 'lte': { flawless: 400, good: 380, fair: 360, damaged: 320, broken: 150, noPower: 25 }, 'wifi': { flawless: 350, good: 330, fair: 310, damaged: 270, broken: 100, noPower: 0 } },
                '256GB': { 'lte': { flawless: 500, good: 480, fair: 460, damaged: 420, broken: 250, noPower: 100 }, 'wifi': { flawless: 450, good: 430, fair: 410, damaged: 370, broken: 200, noPower: 75 } }
            }
        }
    ]
};

const populateDatabase = async () => {
    console.log("Starting to populate Firestore with device data...");
    
    // Do not clean the Samsung and Apple devices, only the iPad collection
    const allBrands = ['iphone', 'samsung', 'ipad'];
    
    // Clearing only the iPad models
    const ipadModelsRef = db.collection('devices').doc('ipad').collection('models');
    const modelsSnapshot = await ipadModelsRef.get();
    if (!modelsSnapshot.empty) {
        console.log(`Clearing existing models for brand: ipad`);
        const batch = db.batch();
        modelsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    }
    
    // Iterate through iPad data and add to Firestore
    for (const device of deviceData.ipads) {
        const docRef = db.collection('devices').doc('ipad').collection('models').doc(device.slug);
        await docRef.set({
            name: device.name,
            brand: 'ipad',
            slug: device.slug,
            imageUrl: device.imageUrl,
            prices: device.prices
        });
        console.log(`Successfully added/updated iPad: ${device.name}`);
    }

    console.log("All device data has been added to Firestore.");
};

populateDatabase().catch(console.error);