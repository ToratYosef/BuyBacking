const fs = require('fs');
const path = require('path');

// --- Configuration Mapping ---
// This map covers ALL possible configurations defined in your previous JSON.
// Key: The deprecated functions.config().path
// Value: The new process.env.KEY
const configMap = {
    // Standard deprecated format (with parentheses)
    'functions.config().shipstation.key': 'process.env.SHIPSTATION_KEY',
    'functions.config().shipstation.secret': 'process.env.SHIPSTATION_SECRET',
    'functions.config().shipenngine.key': 'process.env.SHIPENNGINE_KEY',
    'functions.config().app.frontend_url': 'process.env.APP_FRONTEND_URL',
    'functions.config().zendesk.user': 'process.env.ZENDESK_USER',
    'functions.config().zendesk.token': 'process.env.ZENDESK_TOKEN',
    'functions.config().zendesk.subdomain': 'process.env.ZENDESK_SUBDOMAIN',
    'functions.config().zendesk.url': 'process.env.ZENDESK_URL',
    'functions.config().email.pass': 'process.env.EMAIL_PASS',
    'functions.config().email.user': 'process.env.EMAIL_USER',
    'functions.config().shipengine.sandbox_carrier_code': 'process.env.SHIPENGINE_SANDBOX_CARRIER_CODE',
    'functions.config().shipengine.sandbox_service_code': 'process.env.SHIPENGINE_SANDBOX_SERVICE_CODE',
    'functions.config().shipengine.key': 'process.env.SHIPENGINE_KEY',
    'functions.config().gemini.key': 'process.env.GEMINI_KEY',

    // Deprecated format variation (without parentheses) - often missed by initial migrations
    'functions.config.shipstation.key': 'process.env.SHIPSTATION_KEY',
    'functions.config.shipstation.secret': 'process.env.SHIPSTATION_SECRET',
    'functions.config.shipenngine.key': 'process.env.SHIPENNGINE_KEY',
    'functions.config.app.frontend_url': 'process.env.APP_FRONTEND_URL',
    'functions.config.zendesk.user': 'process.env.ZENDESK_USER',
    'functions.config.zendesk.token': 'process.env.ZENDESK_TOKEN',
    'functions.config.zendesk.subdomain': 'process.env.ZENDESK_SUBDOMAIN',
    'functions.config.zendesk.url': 'process.env.ZENDESK_URL',
    'functions.config.email.pass': 'process.env.EMAIL_PASS',
    'functions.config.email.user': 'process.env.EMAIL_USER',
    'functions.config.shipengine.sandbox_carrier_code': 'process.env.SHIPENGINE_SANDBOX_CARRIER_CODE',
    'functions.config.shipengine.sandbox_service_code': 'process.env.SHIPENGINE_SANDBOX_SERVICE_CODE',
    'functions.config.shipengine.key': 'process.env.SHIPENGINE_KEY',
    'functions.config.gemini.key': 'process.env.GEMINI_KEY',
};

// --- Script Settings ---
const targetFile = path.join('functions', 'index.js');
let totalReplacements = 0;
let fileContent;

function runMigration() {
    console.log(`\nStarting migration check on: ${targetFile}`);
    
    // 1. Read the target file content
    try {
        fileContent = fs.readFileSync(targetFile, 'utf8');
    } catch (error) {
        console.error(`\n🚨 ERROR: Could not read file at ${targetFile}. Are you running this script from the project root?`);
        console.error(error.message);
        return;
    }

    let modifiedContent = fileContent;

    // 2. Iterate over the replacement map
    for (const oldConfig in configMap) {
        const newEnv = configMap[oldConfig];
        
        // Use a Regex to find all global, case-sensitive instances of the old config path
        // Escaping periods and parentheses in the string for regex pattern matching.
        const escapedOldConfig = oldConfig.replace(/([.()])/g, '\\$1');
        const searchRegex = new RegExp(escapedOldConfig, 'g');
        let count = 0;

        modifiedContent = modifiedContent.replace(searchRegex, (match) => {
            count++;
            console.log(`\n✅ FOUND & REPLACED:`);
            console.log(`  Old: ${match}`);
            console.log(`  New: ${newEnv}`);
            return newEnv;
        });

        if (count > 0) {
            console.log(`\n--- Summary for ${newEnv} ---`);
            console.log(`Replaced ${count} instance(s) of ${oldConfig} with ${newEnv}.`);
            totalReplacements += count;
        }
    }

    // 3. Write the modified content back to the file
    if (totalReplacements > 0) {
        try {
            fs.writeFileSync(targetFile, modifiedContent, 'utf8');
            console.log(`\n\n============================================`);
            console.log(`🎉 SUCCESS! ${totalReplacements} instance(s) migrated.`);
            console.log(`The file ${targetFile} has been successfully updated.`);
            console.log(`============================================\n`);
        } catch (error) {
            console.error(`\n🚨 ERROR: Failed to write to file ${targetFile}.`);
            console.error(error.message);
        }
    } else {
        console.log(`\n\n============================================`);
        console.log(`✅ COMPLETE! No deprecated 'functions.config()' paths found.`);
        console.log(`The file is already using 'process.env' variables.`);
        console.log(`============================================\n`);
    }
}

runMigration();
