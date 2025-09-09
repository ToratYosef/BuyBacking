import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' assert { type: "json" };

// Initialize the Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Device data, including prices for different storage options and conditions
const deviceData = {
    iphones: [
        { 
            name: 'iPhone 16 Pro Max', slug: '16-pro-max', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i16pm',
            prices: {
                '256GB': { unlocked: { flawless: 800, good: 785, fair: 775, damaged: 755, broken: 600, noPower: 400 }, locked: { flawless: 775, good: 760, fair: 750, damaged: 730, broken: 575, noPower: 375 } },
                '512GB': { unlocked: { flawless: 900, good: 885, fair: 875, damaged: 855, broken: 700, noPower: 500 }, locked: { flawless: 875, good: 860, fair: 850, damaged: 830, broken: 675, noPower: 475 } },
                '1TB':   { unlocked: { flawless: 1100, good: 1085, fair: 1075, damaged: 1055, broken: 900, noPower: 700 }, locked: { flawless: 1075, good: 1060, fair: 1050, damaged: 1030, broken: 875, noPower: 675 } }
            }
        },
        { 
            name: 'iPhone 16 Pro', slug: '16-pro', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i16p',
            prices: {
                '128GB': { unlocked: { flawless: 750, good: 735, fair: 725, damaged: 705, broken: 550, noPower: 350 }, locked: { flawless: 725, good: 710, fair: 700, damaged: 680, broken: 525, noPower: 325 } },
                '256GB': { unlocked: { flawless: 850, good: 835, fair: 825, damaged: 805, broken: 650, noPower: 450 }, locked: { flawless: 825, good: 810, fair: 800, damaged: 780, broken: 625, noPower: 425 } },
                '512GB': { unlocked: { flawless: 950, good: 935, fair: 925, damaged: 905, broken: 750, noPower: 550 }, locked: { flawless: 925, good: 910, fair: 900, damaged: 880, broken: 725, noPower: 525 } },
                '1TB':   { unlocked: { flawless: 1050, good: 1035, fair: 1025, damaged: 1005, broken: 850, noPower: 650 }, locked: { flawless: 1025, good: 1010, fair: 1000, damaged: 980, broken: 825, noPower: 625 } }
            }
        },
        {
            name: 'iPhone 16', slug: '16', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i16',
            prices: {
                '128GB': { unlocked: { flawless: 650, good: 635, fair: 625, damaged: 605, broken: 450, noPower: 250 }, locked: { flawless: 625, good: 610, fair: 600, damaged: 580, broken: 425, noPower: 225 } },
                '256GB': { unlocked: { flawless: 750, good: 735, fair: 725, damaged: 705, broken: 550, noPower: 350 }, locked: { flawless: 725, good: 710, fair: 700, damaged: 680, broken: 525, noPower: 325 } },
                '512GB': { unlocked: { flawless: 850, good: 835, fair: 825, damaged: 805, broken: 650, noPower: 450 }, locked: { flawless: 825, good: 810, fair: 800, damaged: 780, broken: 625, noPower: 425 } }
            }
        },
        { 
            name: 'iPhone 16 Plus', slug: '16-plus', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i16pl',
            prices: {
                '128GB': { unlocked: { flawless: 600, good: 585, fair: 575, damaged: 555, broken: 400, noPower: 200 }, locked: { flawless: 575, good: 560, fair: 550, damaged: 530, broken: 375, noPower: 175 } },
                '256GB': { unlocked: { flawless: 700, good: 685, fair: 675, damaged: 655, broken: 500, noPower: 300 }, locked: { flawless: 675, good: 660, fair: 650, damaged: 630, broken: 475, noPower: 275 } },
                '512GB': { unlocked: { flawless: 800, good: 785, fair: 775, damaged: 755, broken: 600, noPower: 400 }, locked: { flawless: 775, good: 760, fair: 750, damaged: 730, broken: 575, noPower: 375 } }
            }
        },
        {
            name: 'iPhone 16 SE', slug: '16-se', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i16e',
            prices: {
                '64GB':  { unlocked: { flawless: 400, good: 385, fair: 375, damaged: 355, broken: 200, noPower: 100 }, locked: { flawless: 375, good: 360, fair: 350, damaged: 330, broken: 175, noPower: 75 } },
                '128GB': { unlocked: { flawless: 500, good: 485, fair: 475, damaged: 455, broken: 300, noPower: 200 }, locked: { flawless: 475, good: 460, fair: 450, damaged: 430, broken: 275, noPower: 175 } },
                '256GB': { unlocked: { flawless: 600, good: 585, fair: 575, damaged: 555, broken: 400, noPower: 300 }, locked: { flawless: 575, good: 560, fair: 550, damaged: 530, broken: 375, noPower: 275 } }
            }
        },
        {
            name: 'iPhone 15 Pro Max', slug: '15-pro-max', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i15pm',
            prices: {
                '128GB': { unlocked: { flawless: 700, good: 685, fair: 675, damaged: 655, broken: 500, noPower: 300 }, locked: { flawless: 675, good: 660, fair: 650, damaged: 630, broken: 475, noPower: 275 } },
                '256GB': { unlocked: { flawless: 800, good: 785, fair: 775, damaged: 755, broken: 600, noPower: 400 }, locked: { flawless: 775, good: 760, fair: 750, damaged: 730, broken: 575, noPower: 375 } },
                '512GB': { unlocked: { flawless: 900, good: 885, fair: 875, damaged: 855, broken: 700, noPower: 500 }, locked: { flawless: 875, good: 860, fair: 850, damaged: 830, broken: 675, noPower: 475 } },
                '1TB':   { unlocked: { flawless: 1000, good: 985, fair: 975, damaged: 955, broken: 800, noPower: 600 }, locked: { flawless: 975, good: 960, fair: 950, damaged: 930, broken: 775, noPower: 575 } }
            }
        },
        {
            name: 'iPhone 15 Pro', slug: '15-pro', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i15p',
            prices: {
                '128GB': { unlocked: { flawless: 650, good: 635, fair: 625, damaged: 605, broken: 450, noPower: 250 }, locked: { flawless: 625, good: 610, fair: 600, damaged: 580, broken: 425, noPower: 225 } },
                '256GB': { unlocked: { flawless: 750, good: 735, fair: 725, damaged: 705, broken: 550, noPower: 350 }, locked: { flawless: 725, good: 710, fair: 700, damaged: 680, broken: 525, noPower: 325 } },
                '512GB': { unlocked: { flawless: 850, good: 835, fair: 825, damaged: 805, broken: 650, noPower: 450 }, locked: { flawless: 825, good: 810, fair: 800, damaged: 780, broken: 625, noPower: 425 } },
                '1TB':   { unlocked: { flawless: 950, good: 935, fair: 925, damaged: 905, broken: 750, noPower: 550 }, locked: { flawless: 925, good: 910, fair: 900, damaged: 880, broken: 725, noPower: 525 } }
            }
        },
        {
            name: 'iPhone 15', slug: '15', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i15',
            prices: {
                '128GB': { unlocked: { flawless: 550, good: 535, fair: 525, damaged: 505, broken: 350, noPower: 150 }, locked: { flawless: 525, good: 510, fair: 500, damaged: 480, broken: 325, noPower: 125 } },
                '256GB': { unlocked: { flawless: 650, good: 635, fair: 625, damaged: 605, broken: 450, noPower: 250 }, locked: { flawless: 625, good: 610, fair: 600, damaged: 580, broken: 425, noPower: 225 } },
                '512GB': { unlocked: { flawless: 750, good: 735, fair: 725, damaged: 705, broken: 550, noPower: 350 }, locked: { flawless: 725, good: 710, fair: 700, damaged: 680, broken: 525, noPower: 325 } }
            }
        },
        {
            name: 'iPhone 15 Plus', slug: '15-plus', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i15pl',
            prices: {
                '128GB': { unlocked: { flawless: 500, good: 485, fair: 475, damaged: 455, broken: 300, noPower: 100 }, locked: { flawless: 475, good: 460, fair: 450, damaged: 430, broken: 275, noPower: 75 } },
                '256GB': { unlocked: { flawless: 600, good: 585, fair: 575, damaged: 555, broken: 400, noPower: 200 }, locked: { flawless: 575, good: 560, fair: 550, damaged: 530, broken: 375, noPower: 175 } },
                '512GB': { unlocked: { flawless: 700, good: 685, fair: 675, damaged: 655, broken: 500, noPower: 300 }, locked: { flawless: 675, good: 660, fair: 650, damaged: 630, broken: 475, noPower: 275 } }
            }
        },
        {
            name: 'iPhone 14 Pro Max', slug: '14-pro-max', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i14pm',
            prices: {
                '128GB': { unlocked: { flawless: 500, good: 485, fair: 475, damaged: 455, broken: 300, noPower: 100 }, locked: { flawless: 475, good: 460, fair: 450, damaged: 430, broken: 275, noPower: 75 } },
                '256GB': { unlocked: { flawless: 600, good: 585, fair: 575, damaged: 555, broken: 400, noPower: 200 }, locked: { flawless: 575, good: 560, fair: 550, damaged: 530, broken: 375, noPower: 175 } },
                '512GB': { unlocked: { flawless: 700, good: 685, fair: 675, damaged: 655, broken: 500, noPower: 300 }, locked: { flawless: 675, good: 660, fair: 650, damaged: 630, broken: 475, noPower: 275 } },
                '1TB':   { unlocked: { flawless: 800, good: 785, fair: 775, damaged: 755, broken: 600, noPower: 400 }, locked: { flawless: 775, good: 760, fair: 750, damaged: 730, broken: 575, noPower: 375 } }
            }
        },
        {
            name: 'iPhone 14 Pro', slug: '14-pro', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i14p',
            prices: {
                '128GB': { unlocked: { flawless: 450, good: 435, fair: 425, damaged: 405, broken: 250, noPower: 50 }, locked: { flawless: 425, good: 410, fair: 400, damaged: 380, broken: 225, noPower: 25 } },
                '256GB': { unlocked: { flawless: 550, good: 535, fair: 525, damaged: 505, broken: 350, noPower: 150 }, locked: { flawless: 525, good: 510, fair: 500, damaged: 480, broken: 325, noPower: 125 } },
                '512GB': { unlocked: { flawless: 650, good: 635, fair: 625, damaged: 605, broken: 450, noPower: 250 }, locked: { flawless: 625, good: 610, fair: 600, damaged: 580, broken: 425, noPower: 225 } },
                '1TB':   { unlocked: { flawless: 750, good: 735, fair: 725, damaged: 705, broken: 550, noPower: 350 }, locked: { flawless: 725, good: 710, fair: 700, damaged: 680, broken: 525, noPower: 325 } }
            }
        },
        {
            name: 'iPhone 14', slug: '14', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i14',
            prices: {
                '128GB': { unlocked: { flawless: 380, good: 365, fair: 355, damaged: 335, broken: 180, noPower: 0 }, locked: { flawless: 355, good: 340, fair: 330, damaged: 310, broken: 155, noPower: 0 } },
                '256GB': { unlocked: { flawless: 480, good: 465, fair: 455, damaged: 435, broken: 280, noPower: 80 }, locked: { flawless: 455, good: 440, fair: 430, damaged: 410, broken: 255, noPower: 55 } },
                '512GB': { unlocked: { flawless: 580, good: 565, fair: 555, damaged: 535, broken: 380, noPower: 180 }, locked: { flawless: 555, good: 540, fair: 530, damaged: 510, broken: 355, noPower: 155 } }
            }
        },
        {
            name: 'iPhone 14 Plus', slug: '14-plus', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i14pl',
            prices: {
                '128GB': { unlocked: { flawless: 350, good: 335, fair: 325, damaged: 305, broken: 150, noPower: 0 }, locked: { flawless: 325, good: 310, fair: 300, damaged: 280, broken: 125, noPower: 0 } },
                '256GB': { unlocked: { flawless: 450, good: 435, fair: 425, damaged: 405, broken: 250, noPower: 50 }, locked: { flawless: 425, good: 410, fair: 400, damaged: 380, broken: 225, noPower: 25 } },
                '512GB': { unlocked: { flawless: 550, good: 535, fair: 525, damaged: 505, broken: 350, noPower: 150 }, locked: { flawless: 525, good: 510, fair: 500, damaged: 480, broken: 325, noPower: 125 } }
            }
        },
        {
            name: 'iPhone 13 Pro Max', slug: '13-pro-max', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i13pm',
            prices: {
                '128GB': { unlocked: { flawless: 400, good: 385, fair: 375, damaged: 355, broken: 200, noPower: 0 }, locked: { flawless: 375, good: 360, fair: 350, damaged: 330, broken: 175, noPower: 0 } },
                '256GB': { unlocked: { flawless: 500, good: 485, fair: 475, damaged: 455, broken: 300, noPower: 100 }, locked: { flawless: 475, good: 460, fair: 450, damaged: 430, broken: 275, noPower: 75 } },
                '512GB': { unlocked: { flawless: 600, good: 585, fair: 575, damaged: 555, broken: 400, noPower: 200 }, locked: { flawless: 575, good: 560, fair: 550, damaged: 530, broken: 375, noPower: 175 } },
                '1TB':   { unlocked: { flawless: 700, good: 685, fair: 675, damaged: 655, broken: 500, noPower: 300 }, locked: { flawless: 675, good: 660, fair: 650, damaged: 630, broken: 475, noPower: 275 } }
            }
        },
        {
            name: 'iPhone 13 Pro', slug: '13-pro', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i13p',
            prices: {
                '128GB': { unlocked: { flawless: 350, good: 335, fair: 325, damaged: 305, broken: 150, noPower: 0 }, locked: { flawless: 325, good: 310, fair: 300, damaged: 280, broken: 125, noPower: 0 } },
                '256GB': { unlocked: { flawless: 450, good: 435, fair: 425, damaged: 405, broken: 250, noPower: 50 }, locked: { flawless: 425, good: 410, fair: 400, damaged: 380, broken: 225, noPower: 25 } },
                '512GB': { unlocked: { flawless: 550, good: 535, fair: 525, damaged: 505, broken: 350, noPower: 150 }, locked: { flawless: 525, good: 510, fair: 500, damaged: 480, broken: 325, noPower: 125 } },
                '1TB':   { unlocked: { flawless: 650, good: 635, fair: 625, damaged: 605, broken: 450, noPower: 250 }, locked: { flawless: 625, good: 610, fair: 600, damaged: 580, broken: 425, noPower: 225 } }
            }
        },
        {
            name: 'iPhone 13', slug: '13', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i13',
            prices: {
                '128GB': { unlocked: { flawless: 300, good: 285, fair: 275, damaged: 255, broken: 100, noPower: 0 }, locked: { flawless: 275, good: 260, fair: 250, damaged: 230, broken: 75, noPower: 0 } },
                '256GB': { unlocked: { flawless: 400, good: 385, fair: 375, damaged: 355, broken: 200, noPower: 0 }, locked: { flawless: 375, good: 360, fair: 350, damaged: 330, broken: 175, noPower: 0 } },
                '512GB': { unlocked: { flawless: 500, good: 485, fair: 475, damaged: 455, broken: 300, noPower: 100 }, locked: { flawless: 475, good: 460, fair: 450, damaged: 430, broken: 275, noPower: 75 } }
            }
        },
        {
            name: 'iPhone 13 mini', slug: '13-mini', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i13m',
            prices: {
                '128GB': { unlocked: { flawless: 280, good: 265, fair: 255, damaged: 235, broken: 80, noPower: 0 }, locked: { flawless: 255, good: 240, fair: 230, damaged: 210, broken: 55, noPower: 0 } },
                '256GB': { unlocked: { flawless: 380, good: 365, fair: 355, damaged: 335, broken: 180, noPower: 0 }, locked: { flawless: 355, good: 340, fair: 330, damaged: 310, broken: 155, noPower: 0 } },
                '512GB': { unlocked: { flawless: 480, good: 465, fair: 455, damaged: 435, broken: 280, noPower: 80 }, locked: { flawless: 455, good: 440, fair: 430, damaged: 410, broken: 255, noPower: 55 } }
            }
        },
        {
            name: 'iPhone 12 Pro Max', slug: '12-pro-max', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i12pm',
            prices: {
                '128GB': { unlocked: { flawless: 350, good: 335, fair: 325, damaged: 305, broken: 150, noPower: 0 }, locked: { flawless: 325, good: 310, fair: 300, damaged: 280, broken: 125, noPower: 0 } },
                '256GB': { unlocked: { flawless: 450, good: 435, fair: 425, damaged: 405, broken: 250, noPower: 50 }, locked: { flawless: 425, good: 410, fair: 400, damaged: 380, broken: 225, noPower: 25 } },
                '512GB': { unlocked: { flawless: 550, good: 535, fair: 525, damaged: 505, broken: 350, noPower: 150 }, locked: { flawless: 525, good: 510, fair: 500, damaged: 480, broken: 325, noPower: 125 } }
            }
        },
        {
            name: 'iPhone 12 Pro', slug: '12-pro', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/i12p',
            prices: {
                '128GB': { unlocked: { flawless: 300, good: 285, fair: 275, damaged: 255, broken: 100, noPower: 0 }, locked: { flawless: 275, good: 260, fair: 250, damaged: 230, broken: 75, noPower: 0 } },
                '256GB': { unlocked: { flawless: 400, good: 385, fair: 375, damaged: 355, broken: 200, noPower: 0 }, locked: { flawless: 375, good: 360, fair: 350, damaged: 330, broken: 175, noPower: 0 } },
                '512GB': { unlocked: { flawless: 500, good: 485, fair: 475, damaged: 455, broken: 300, noPower: 100 }, locked: { flawless: 475, good: 460, fair: 450, damaged: 430, broken: 275, noPower: 75 } }
            }
        },
        {
            name: 'iPhone SE (3rd Gen)', slug: 'se-3rd-gen', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/ise3',
            prices: {
                '64GB':  { unlocked: { flawless: 300, good: 285, fair: 275, damaged: 255, broken: 100, noPower: 0 }, locked: { flawless: 275, good: 260, fair: 250, damaged: 230, broken: 75, noPower: 0 } },
                '128GB': { unlocked: { flawless: 400, good: 385, fair: 375, damaged: 355, broken: 200, noPower: 0 }, locked: { flawless: 375, good: 360, fair: 350, damaged: 330, broken: 175, noPower: 0 } },
                '256GB': { unlocked: { flawless: 500, good: 485, fair: 475, damaged: 455, broken: 300, noPower: 100 }, locked: { flawless: 475, good: 460, fair: 450, damaged: 430, broken: 275, noPower: 75 } }
            }
        },
        {
            name: 'iPhone SE (2nd Gen)', slug: 'se-2nd-gen', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/ise2',
            prices: {
                '64GB':  { unlocked: { flawless: 200, good: 185, fair: 175, damaged: 155, broken: 0, noPower: 0 }, locked: { flawless: 175, good: 160, fair: 150, damaged: 130, broken: 0, noPower: 0 } },
                '128GB': { unlocked: { flawless: 300, good: 285, fair: 275, damaged: 255, broken: 100, noPower: 0 }, locked: { flawless: 275, good: 260, fair: 250, damaged: 230, broken: 75, noPower: 0 } },
                '256GB': { unlocked: { flawless: 400, good: 385, fair: 375, damaged: 355, broken: 200, noPower: 0 }, locked: { flawless: 375, good: 360, fair: 350, damaged: 330, broken: 175, noPower: 0 } }
            }
        }
    ],
    samsung: [
        {
            name: 'Galaxy S25 Ultra', slug: 'galaxy-s25-ultra', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s25u',
            prices: {
                '256GB': { unlocked: { flawless: 900, good: 885, fair: 875, damaged: 855, broken: 700, noPower: 500 }, locked: { flawless: 875, good: 860, fair: 850, damaged: 830, broken: 675, noPower: 475 } },
                '512GB': { unlocked: { flawless: 1000, good: 985, fair: 975, damaged: 955, broken: 800, noPower: 600 }, locked: { flawless: 975, good: 960, fair: 950, damaged: 930, broken: 775, noPower: 575 } },
                '1TB':   { unlocked: { flawless: 1100, good: 1085, fair: 1075, damaged: 1055, broken: 900, noPower: 700 }, locked: { flawless: 1075, good: 1060, fair: 1050, damaged: 1030, broken: 875, noPower: 675 } }
            }
        },
        {
            name: 'Galaxy S25+', slug: 'galaxy-s25-plus', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s25p',
            prices: {
                '256GB': { unlocked: { flawless: 800, good: 785, fair: 775, damaged: 755, broken: 600, noPower: 400 }, locked: { flawless: 775, good: 760, fair: 750, damaged: 730, broken: 575, noPower: 375 } },
                '512GB': { unlocked: { flawless: 900, good: 885, fair: 875, damaged: 855, broken: 700, noPower: 500 }, locked: { flawless: 875, good: 860, fair: 850, damaged: 830, broken: 675, noPower: 475 } }
            }
        },
        {
            name: 'Galaxy S25', slug: 'galaxy-s25', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s25',
            prices: {
                '128GB': { unlocked: { flawless: 700, good: 685, fair: 675, damaged: 655, broken: 500, noPower: 300 }, locked: { flawless: 675, good: 660, fair: 650, damaged: 630, broken: 475, noPower: 275 } },
                '256GB': { unlocked: { flawless: 800, good: 785, fair: 775, damaged: 755, broken: 600, noPower: 400 }, locked: { flawless: 775, good: 760, fair: 750, damaged: 730, broken: 575, noPower: 375 } }
            }
        },
        {
            name: 'Galaxy Z Flip 6', slug: 'galaxy-z-flip-6', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/zflip6',
            prices: {
                '256GB': { unlocked: { flawless: 700, good: 685, fair: 675, damaged: 655, broken: 500, noPower: 300 }, locked: { flawless: 675, good: 660, fair: 650, damaged: 630, broken: 475, noPower: 275 } },
                '512GB': { unlocked: { flawless: 800, good: 785, fair: 775, damaged: 755, broken: 600, noPower: 400 }, locked: { flawless: 775, good: 760, fair: 750, damaged: 730, broken: 575, noPower: 375 } }
            }
        },
        {
            name: 'Galaxy Z Fold 6', slug: 'galaxy-z-fold-6', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/zfold6',
            prices: {
                '256GB': { unlocked: { flawless: 1000, good: 985, fair: 975, damaged: 955, broken: 800, noPower: 600 }, locked: { flawless: 975, good: 960, fair: 950, damaged: 930, broken: 775, noPower: 575 } },
                '512GB': { unlocked: { flawless: 1100, good: 1085, fair: 1075, damaged: 1055, broken: 900, noPower: 700 }, locked: { flawless: 1075, good: 1060, fair: 1050, damaged: 1030, broken: 875, noPower: 675 } },
                '1TB':   { unlocked: { flawless: 1300, good: 1285, fair: 1275, damaged: 1255, broken: 1100, noPower: 900 }, locked: { flawless: 1275, good: 1260, fair: 1250, damaged: 1230, broken: 1075, noPower: 875 } }
            }
        },
        {
            name: 'Galaxy S24 Ultra', slug: 'galaxy-s24-ultra', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s24u',
            prices: {
                '256GB': { unlocked: { flawless: 850, good: 835, fair: 825, damaged: 805, broken: 650, noPower: 450 }, locked: { flawless: 825, good: 810, fair: 800, damaged: 780, broken: 625, noPower: 425 } },
                '512GB': { unlocked: { flawless: 950, good: 935, fair: 925, damaged: 905, broken: 750, noPower: 550 }, locked: { flawless: 925, good: 910, fair: 900, damaged: 880, broken: 725, noPower: 525 } },
                '1TB':   { unlocked: { flawless: 1050, good: 1035, fair: 1025, damaged: 1005, broken: 850, noPower: 650 }, locked: { flawless: 1025, good: 1010, fair: 1000, damaged: 980, broken: 825, noPower: 625 } }
            }
        },
        {
            name: 'Galaxy S24+', slug: 'galaxy-s24-plus', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s24p',
            prices: {
                '256GB': { unlocked: { flawless: 750, good: 735, fair: 725, damaged: 705, broken: 550, noPower: 350 }, locked: { flawless: 725, good: 710, fair: 700, damaged: 680, broken: 525, noPower: 325 } },
                '512GB': { unlocked: { flawless: 850, good: 835, fair: 825, damaged: 805, broken: 650, noPower: 450 }, locked: { flawless: 825, good: 810, fair: 800, damaged: 780, broken: 625, noPower: 425 } }
            }
        },
        {
            name: 'Galaxy S24', slug: 'galaxy-s24', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s24',
            prices: {
                '128GB': { unlocked: { flawless: 650, good: 635, fair: 625, damaged: 605, broken: 450, noPower: 250 }, locked: { flawless: 625, good: 610, fair: 600, damaged: 580, broken: 425, noPower: 225 } },
                '256GB': { unlocked: { flawless: 750, good: 735, fair: 725, damaged: 705, broken: 550, noPower: 350 }, locked: { flawless: 725, good: 710, fair: 700, damaged: 680, broken: 525, noPower: 325 } }
            }
        },
        {
            name: 'Galaxy S24 FE', slug: 'galaxy-s24-fe', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s24fe',
            prices: {
                '128GB': { unlocked: { flawless: 500, good: 485, fair: 475, damaged: 455, broken: 300, noPower: 100 }, locked: { flawless: 475, good: 460, fair: 450, damaged: 430, broken: 275, noPower: 75 } },
                '256GB': { unlocked: { flawless: 600, good: 585, fair: 575, damaged: 555, broken: 400, noPower: 200 }, locked: { flawless: 575, good: 560, fair: 550, damaged: 530, broken: 375, noPower: 175 } }
            }
        },
        {
            name: 'Galaxy S23 Ultra', slug: 'galaxy-s23-ultra', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s23u',
            prices: {
                '256GB': { unlocked: { flawless: 700, good: 685, fair: 675, damaged: 655, broken: 500, noPower: 300 }, locked: { flawless: 675, good: 660, fair: 650, damaged: 630, broken: 475, noPower: 275 } },
                '512GB': { unlocked: { flawless: 800, good: 785, fair: 775, damaged: 755, broken: 600, noPower: 400 }, locked: { flawless: 775, good: 760, fair: 750, damaged: 730, broken: 575, noPower: 375 } },
                '1TB':   { unlocked: { flawless: 900, good: 885, fair: 875, damaged: 855, broken: 700, noPower: 500 }, locked: { flawless: 875, good: 860, fair: 850, damaged: 830, broken: 675, noPower: 475 } }
            }
        },
        {
            name: 'Galaxy S23+', slug: 'galaxy-s23-plus', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s23p',
            prices: {
                '256GB': { unlocked: { flawless: 600, good: 585, fair: 575, damaged: 555, broken: 400, noPower: 200 }, locked: { flawless: 575, good: 560, fair: 550, damaged: 530, broken: 375, noPower: 175 } },
                '512GB': { unlocked: { flawless: 700, good: 685, fair: 675, damaged: 655, broken: 500, noPower: 300 }, locked: { flawless: 675, good: 660, fair: 650, damaged: 630, broken: 475, noPower: 275 } }
            }
        },
        {
            name: 'Galaxy S23', slug: 'galaxy-s23', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s23',
            prices: {
                '128GB': { unlocked: { flawless: 500, good: 485, fair: 475, damaged: 455, broken: 300, noPower: 100 }, locked: { flawless: 475, good: 460, fair: 450, damaged: 430, broken: 275, noPower: 75 } },
                '256GB': { unlocked: { flawless: 600, good: 585, fair: 575, damaged: 555, broken: 400, noPower: 200 }, locked: { flawless: 575, good: 560, fair: 550, damaged: 530, broken: 375, noPower: 175 } }
            }
        },
        {
            name: 'Galaxy S23 FE', slug: 'galaxy-s23-fe', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s23fe',
            prices: {
                '128GB': { unlocked: { flawless: 450, good: 435, fair: 425, damaged: 405, broken: 250, noPower: 50 }, locked: { flawless: 425, good: 410, fair: 400, damaged: 380, broken: 225, noPower: 25 } },
                '256GB': { unlocked: { flawless: 550, good: 535, fair: 525, damaged: 505, broken: 350, noPower: 150 }, locked: { flawless: 525, good: 510, fair: 500, damaged: 480, broken: 325, noPower: 125 } }
            }
        },
        {
            name: 'Galaxy Z Fold 5', slug: 'galaxy-z-fold-5', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/zfold5',
            prices: {
                '256GB': { unlocked: { flawless: 900, good: 885, fair: 875, damaged: 855, broken: 700, noPower: 500 }, locked: { flawless: 875, good: 860, fair: 850, damaged: 830, broken: 675, noPower: 475 } },
                '512GB': { unlocked: { flawless: 1000, good: 985, fair: 975, damaged: 955, broken: 800, noPower: 600 }, locked: { flawless: 975, good: 960, fair: 950, damaged: 930, broken: 775, noPower: 575 } },
                '1TB':   { unlocked: { flawless: 1200, good: 1185, fair: 1175, damaged: 1155, broken: 1000, noPower: 800 }, locked: { flawless: 1175, good: 1160, fair: 1150, damaged: 1130, broken: 975, noPower: 775 } }
            }
        },
        {
            name: 'Galaxy Z Flip 5', slug: 'galaxy-z-flip-5', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/zflip5',
            prices: {
                '256GB': { unlocked: { flawless: 650, good: 635, fair: 625, damaged: 605, broken: 450, noPower: 250 }, locked: { flawless: 625, good: 610, fair: 600, damaged: 580, broken: 425, noPower: 225 } },
                '512GB': { unlocked: { flawless: 750, good: 735, fair: 725, damaged: 705, broken: 550, noPower: 350 }, locked: { flawless: 725, good: 710, fair: 700, damaged: 680, broken: 525, noPower: 325 } }
            }
        },
        {
            name: 'Galaxy Z Fold 4', slug: 'galaxy-z-fold-4', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/zfold4',
            prices: {
                '256GB': { unlocked: { flawless: 700, good: 685, fair: 675, damaged: 655, broken: 500, noPower: 300 }, locked: { flawless: 675, good: 660, fair: 650, damaged: 630, broken: 475, noPower: 275 } },
                '512GB': { unlocked: { flawless: 800, good: 785, fair: 775, damaged: 755, broken: 600, noPower: 400 }, locked: { flawless: 775, good: 760, fair: 750, damaged: 730, broken: 575, noPower: 375 } },
                '1TB':   { unlocked: { flawless: 900, good: 885, fair: 875, damaged: 855, broken: 700, noPower: 500 }, locked: { flawless: 875, good: 860, fair: 850, damaged: 830, broken: 675, noPower: 475 } }
            }
        },
        {
            name: 'Galaxy Z Flip 4', slug: 'galaxy-z-flip-4', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/zflip4',
            prices: {
                '128GB': { unlocked: { flawless: 450, good: 435, fair: 425, damaged: 405, broken: 250, noPower: 50 }, locked: { flawless: 425, good: 410, fair: 400, damaged: 380, broken: 225, noPower: 25 } },
                '256GB': { unlocked: { flawless: 550, good: 535, fair: 525, damaged: 505, broken: 350, noPower: 150 }, locked: { flawless: 525, good: 510, fair: 500, damaged: 480, broken: 325, noPower: 125 } }
            }
        },
        {
            name: 'Galaxy S22 Ultra', slug: 'galaxy-s22-ultra', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s22u',
            prices: {
                '128GB': { unlocked: { flawless: 550, good: 535, fair: 525, damaged: 505, broken: 350, noPower: 150 }, locked: { flawless: 525, good: 510, fair: 500, damaged: 480, broken: 325, noPower: 125 } },
                '256GB': { unlocked: { flawless: 650, good: 635, fair: 625, damaged: 605, broken: 450, noPower: 250 }, locked: { flawless: 625, good: 610, fair: 600, damaged: 580, broken: 425, noPower: 225 } },
                '512GB': { unlocked: { flawless: 750, good: 735, fair: 725, damaged: 705, broken: 550, noPower: 350 }, locked: { flawless: 725, good: 710, fair: 700, damaged: 680, broken: 525, noPower: 325 } },
                '1TB':   { unlocked: { flawless: 850, good: 835, fair: 825, damaged: 805, broken: 650, noPower: 450 }, locked: { flawless: 825, good: 810, fair: 800, damaged: 780, broken: 625, noPower: 425 } }
            }
        },
        {
            name: 'Galaxy S22+', slug: 'galaxy-s22-plus', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s22p',
            prices: {
                '128GB': { unlocked: { flawless: 450, good: 435, fair: 425, damaged: 405, broken: 250, noPower: 50 }, locked: { flawless: 425, good: 410, fair: 400, damaged: 380, broken: 225, noPower: 25 } },
                '256GB': { unlocked: { flawless: 550, good: 535, fair: 525, damaged: 505, broken: 350, noPower: 150 }, locked: { flawless: 525, good: 510, fair: 500, damaged: 480, broken: 325, noPower: 125 } }
            }
        },
        {
            name: 'Galaxy S22', slug: 'galaxy-s22', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s22',
            prices: {
                '128GB': { unlocked: { flawless: 380, good: 365, fair: 355, damaged: 335, broken: 180, noPower: 0 }, locked: { flawless: 355, good: 340, fair: 330, damaged: 310, broken: 155, noPower: 0 } },
                '256GB': { unlocked: { flawless: 480, good: 465, fair: 455, damaged: 435, broken: 280, noPower: 80 }, locked: { flawless: 455, good: 440, fair: 430, damaged: 410, broken: 255, noPower: 55 } }
            }
        },
        {
            name: 'Galaxy S21 Ultra', slug: 'galaxy-s21-ultra', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s21u',
            prices: {
                '128GB': { unlocked: { flawless: 400, good: 385, fair: 375, damaged: 355, broken: 200, noPower: 0 }, locked: { flawless: 375, good: 360, fair: 350, damaged: 330, broken: 175, noPower: 0 } },
                '256GB': { unlocked: { flawless: 500, good: 485, fair: 475, damaged: 455, broken: 300, noPower: 100 }, locked: { flawless: 475, good: 460, fair: 450, damaged: 430, broken: 275, noPower: 75 } },
                '512GB': { unlocked: { flawless: 600, good: 585, fair: 575, damaged: 555, broken: 400, noPower: 200 }, locked: { flawless: 575, good: 560, fair: 550, damaged: 530, broken: 375, noPower: 175 } }
            }
        },
        {
            name: 'Galaxy S21+', slug: 'galaxy-s21-plus', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s21p',
            prices: {
                '128GB': { unlocked: { flawless: 320, good: 305, fair: 295, damaged: 275, broken: 120, noPower: 0 }, locked: { flawless: 295, good: 280, fair: 270, damaged: 250, broken: 95, noPower: 0 } },
                '256GB': { unlocked: { flawless: 420, good: 405, fair: 395, damaged: 375, broken: 220, noPower: 20 }, locked: { flawless: 395, good: 380, fair: 370, damaged: 350, broken: 195, noPower: 0 } }
            }
        },
        {
            name: 'Galaxy S21', slug: 'galaxy-s21', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s21',
            prices: {
                '128GB': { unlocked: { flawless: 280, good: 265, fair: 255, damaged: 235, broken: 80, noPower: 0 }, locked: { flawless: 255, good: 240, fair: 230, damaged: 210, broken: 55, noPower: 0 } },
                '256GB': { unlocked: { flawless: 380, good: 365, fair: 355, damaged: 335, broken: 180, noPower: 0 }, locked: { flawless: 355, good: 340, fair: 330, damaged: 310, broken: 155, noPower: 0 } }
            }
        },
        {
            name: 'Galaxy S21 FE', slug: 'galaxy-s21-fe', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/s21fe',
            prices: {
                '128GB': { unlocked: { flawless: 250, good: 235, fair: 225, damaged: 205, broken: 50, noPower: 0 }, locked: { flawless: 225, good: 210, fair: 200, damaged: 180, broken: 25, noPower: 0 } },
                '256GB': { unlocked: { flawless: 350, good: 335, fair: 325, damaged: 305, broken: 150, noPower: 0 }, locked: { flawless: 325, good: 310, fair: 300, damaged: 280, broken: 125, noPower: 0 } }
            }
        },
        {
            name: 'Galaxy A54', slug: 'a54', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/a54',
            prices: {
                '128GB': { unlocked: { flawless: 200, good: 185, fair: 175, damaged: 155, broken: 0, noPower: 0 }, locked: { flawless: 175, good: 160, fair: 150, damaged: 130, broken: 0, noPower: 0 } }
            }
        },
        {
            name: 'Galaxy A34', slug: 'a34', imageUrl: 'https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/samsung/assets/a34',
            prices: {
                '128GB': { unlocked: { flawless: 150, good: 135, fair: 125, damaged: 105, broken: 0, noPower: 0 }, locked: { flawless: 125, good: 110, fair: 100, damaged: 80, broken: 0, noPower: 0 } }
            }
        }
    ]
};

const populateDatabase = async () => {
    console.log("Starting to populate Firestore with device data...");

    // Iterate through iPhone data
    for (const device of deviceData.iphones) {
        const docRef = db.collection('devices').doc('iphone').collection('models').doc(device.slug);
        await docRef.set({
            name: device.name,
            brand: 'iphones',
            slug: device.slug,
            imageUrl: device.imageUrl,
            prices: device.prices
        });
        console.log(`Successfully added/updated iPhone: ${device.name}`);
    }

    // Iterate through Samsung data
    for (const device of deviceData.samsung) {
        const docRef = db.collection('devices').doc('samsung').collection('models').doc(device.slug);
        await docRef.set({
            name: device.name,
            brand: 'samsung',
            slug: device.slug,
            imageUrl: device.imageUrl,
            prices: device.prices
        });
        console.log(`Successfully added/updated Samsung: ${device.name}`);
    }

    console.log("All device data has been added to Firestore.");
};

populateDatabase().catch(console.error);