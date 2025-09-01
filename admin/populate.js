import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' assert { type: "json" };

// Initialize the Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Device data for Google Pixel models.
const deviceData = {
    pixels: [
        {
            name: 'Google Pixel 7 Pro', slug: 'pixel-7-pro', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/google/assets/gp7pro',
            prices: {
                '128GB': { 'unlocked': { flawless: 450, good: 430, fair: 410, damaged: 370, broken: 200, noPower: 100 }, 'locked': { flawless: 360, good: 344, fair: 328, damaged: 296, broken: 160, noPower: 80 } },
                '256GB': { 'unlocked': { flawless: 500, good: 480, fair: 460, damaged: 420, broken: 250, noPower: 120 }, 'locked': { flawless: 400, good: 384, fair: 368, damaged: 336, broken: 200, noPower: 96 } },
                '512GB': { 'unlocked': { flawless: 550, good: 530, fair: 510, damaged: 470, broken: 300, noPower: 150 }, 'locked': { flawless: 440, good: 424, fair: 408, damaged: 376, broken: 240, noPower: 120 } }
            }
        },
        {
            name: 'Google Pixel 8', slug: 'pixel-8', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/google/assets/gp8',
            prices: {
                '128GB': { 'unlocked': { flawless: 500, good: 480, fair: 460, damaged: 420, broken: 250, noPower: 120 }, 'locked': { flawless: 400, good: 384, fair: 368, damaged: 336, broken: 200, noPower: 96 } },
                '256GB': { 'unlocked': { flawless: 550, good: 530, fair: 510, damaged: 470, broken: 300, noPower: 150 }, 'locked': { flawless: 440, good: 424, fair: 408, damaged: 376, broken: 240, noPower: 120 } }
            }
        },
        {
            name: 'Google Pixel 8a', slug: 'pixel-8a', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/google/assets/gp8a',
            prices: {
                '128GB': { 'unlocked': { flawless: 350, good: 330, fair: 310, damaged: 270, broken: 100, noPower: 50 }, 'locked': { flawless: 280, good: 264, fair: 248, damaged: 216, broken: 80, noPower: 40 } },
                '256GB': { 'unlocked': { flawless: 400, good: 380, fair: 360, damaged: 320, broken: 150, noPower: 75 }, 'locked': { flawless: 320, good: 304, fair: 288, damaged: 256, broken: 120, noPower: 60 } }
            }
        },
        {
            name: 'Google Pixel 9', slug: 'pixel-9', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/google/assets/gp9',
            prices: {
                '128GB': { 'unlocked': { flawless: 600, good: 580, fair: 560, damaged: 520, broken: 350, noPower: 180 }, 'locked': { flawless: 480, good: 464, fair: 448, damaged: 416, broken: 280, noPower: 144 } },
                '256GB': { 'unlocked': { flawless: 650, good: 630, fair: 610, damaged: 570, broken: 400, noPower: 200 }, 'locked': { flawless: 520, good: 504, fair: 488, damaged: 456, broken: 320, noPower: 160 } }
            }
        },
        {
            name: 'Google Pixel 9 Pro', slug: 'pixel-9-pro', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/google/assets/gp9p',
            prices: {
                '128GB': { 'unlocked': { flawless: 800, good: 780, fair: 760, damaged: 720, broken: 550, noPower: 300 }, 'locked': { flawless: 640, good: 624, fair: 608, damaged: 576, broken: 440, noPower: 240 } },
                '256GB': { 'unlocked': { flawless: 850, good: 830, fair: 810, damaged: 770, broken: 600, noPower: 320 }, 'locked': { flawless: 680, good: 664, fair: 648, damaged: 616, broken: 480, noPower: 256 } },
                '512GB': { 'unlocked': { flawless: 900, good: 880, fair: 860, damaged: 820, broken: 650, noPower: 350 }, 'locked': { flawless: 720, good: 704, fair: 688, damaged: 656, broken: 520, noPower: 280 } },
                '1TB': { 'unlocked': { flawless: 1000, good: 980, fair: 960, damaged: 920, broken: 750, noPower: 400 }, 'locked': { flawless: 800, good: 784, fair: 768, damaged: 736, broken: 600, noPower: 320 } }
            }
        },
        {
            name: 'Google Pixel 9 Pro XL', slug: 'pixel-9-pro-xl', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/google/assets/gp9pxl',
            prices: {
                '256GB': { 'unlocked': { flawless: 900, good: 880, fair: 860, damaged: 820, broken: 650, noPower: 350 }, 'locked': { flawless: 720, good: 704, fair: 688, damaged: 656, broken: 520, noPower: 280 } },
                '512GB': { 'unlocked': { flawless: 1000, good: 980, fair: 960, damaged: 920, broken: 750, noPower: 400 }, 'locked': { flawless: 800, good: 784, fair: 768, damaged: 736, broken: 600, noPower: 320 } },
                '1TB': { 'unlocked': { flawless: 1200, good: 1180, fair: 1160, damaged: 1120, broken: 950, noPower: 500 }, 'locked': { flawless: 960, good: 944, fair: 928, damaged: 896, broken: 760, noPower: 400 } }
            }
        },
        {
            name: 'Google Pixel 10', slug: 'pixel-10', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/google/assets/gp10',
            prices: {
                '128GB': { 'unlocked': { flawless: 700, good: 680, fair: 660, damaged: 620, broken: 450, noPower: 220 }, 'locked': { flawless: 560, good: 544, fair: 528, damaged: 496, broken: 360, noPower: 176 } },
                '256GB': { 'unlocked': { flawless: 750, good: 730, fair: 710, damaged: 670, broken: 500, noPower: 250 }, 'locked': { flawless: 600, good: 584, fair: 568, damaged: 536, broken: 400, noPower: 200 } }
            }
        },
        {
            name: 'Google Pixel 10 Pro', slug: 'pixel-10-pro', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/google/assets/gp10p',
            prices: {
                '128GB': { 'unlocked': { flawless: 900, good: 880, fair: 860, damaged: 820, broken: 650, noPower: 350 }, 'locked': { flawless: 720, good: 704, fair: 688, damaged: 656, broken: 520, noPower: 280 } },
                '256GB': { 'unlocked': { flawless: 1000, good: 980, fair: 960, damaged: 920, broken: 750, noPower: 400 }, 'locked': { flawless: 800, good: 784, fair: 768, damaged: 736, broken: 600, noPower: 320 } },
                '512GB': { 'unlocked': { flawless: 1100, good: 1080, fair: 1060, damaged: 1020, broken: 850, noPower: 450 }, 'locked': { flawless: 880, good: 864, fair: 848, damaged: 816, broken: 680, noPower: 360 } },
                '1TB': { 'unlocked': { flawless: 1300, good: 1280, fair: 1260, damaged: 1220, broken: 1050, noPower: 550 }, 'locked': { flawless: 1040, good: 1024, fair: 1008, damaged: 976, broken: 840, noPower: 440 } }
            }
        },
        {
            name: 'Google Pixel 10 Pro XL', slug: 'pixel-10-pro-xl', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/google/assets/gp10pxl',
            prices: {
                '256GB': { 'unlocked': { flawless: 1100, good: 1080, fair: 1060, damaged: 1020, broken: 850, noPower: 450 }, 'locked': { flawless: 880, good: 864, fair: 848, damaged: 816, broken: 680, noPower: 360 } },
                '512GB': { 'unlocked': { flawless: 1200, good: 1180, fair: 1160, damaged: 1120, broken: 950, noPower: 500 }, 'locked': { flawless: 960, good: 944, fair: 928, damaged: 896, broken: 760, noPower: 400 } },
                '1TB': { 'unlocked': { flawless: 1450, good: 1430, fair: 1410, damaged: 1370, broken: 1200, noPower: 600 }, 'locked': { flawless: 1160, good: 1144, fair: 1128, damaged: 1096, broken: 960, noPower: 480 } }
            }
        },
        {
            name: 'Google Pixel 10 Pro Fold', slug: 'pixel-10-pro-fold', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/google/assets/gp10pfold',
            prices: {
                '256GB': { 'unlocked': { flawless: 1700, good: 1680, fair: 1660, damaged: 1620, broken: 1450, noPower: 800 }, 'locked': { flawless: 1360, good: 1344, fair: 1328, damaged: 1296, broken: 1160, noPower: 640 } },
                '512GB': { 'unlocked': { flawless: 1800, good: 1780, fair: 1760, damaged: 1720, broken: 1550, noPower: 850 }, 'locked': { flawless: 1440, good: 1424, fair: 1408, damaged: 1376, broken: 1240, noPower: 680 } },
                '1TB': { 'unlocked': { flawless: 2000, good: 1980, fair: 1960, damaged: 1920, broken: 1750, noPower: 900 }, 'locked': { flawless: 1600, good: 1584, fair: 1568, damaged: 1536, broken: 1400, noPower: 720 } }
            }
        }
    ]
};

const populateDatabase = async () => {
    console.log("Starting to populate Firestore with device data...");
    
    // Clearing only the Google Pixel models
    const pixelModelsRef = db.collection('devices').doc('google_pixel').collection('models');
    const modelsSnapshot = await pixelModelsRef.get();
    if (!modelsSnapshot.empty) {
        console.log(`Clearing existing models for brand: google_pixel`);
        const batch = db.batch();
        modelsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    }
    
    // Iterate through Pixel data and add to Firestore
    for (const device of deviceData.pixels) {
        const docRef = db.collection('devices').doc('google_pixel').collection('models').doc(device.slug);
        await docRef.set({
            name: device.name,
            brand: 'google_pixel',
            slug: device.slug,
            imageUrl: device.imageUrl,
            prices: device.prices
        });
        console.log(`Successfully added/updated Google Pixel: ${device.name}`);
    }

    console.log("All Google Pixel device data has been added to Firestore.");
};

populateDatabase().catch(console.error);
