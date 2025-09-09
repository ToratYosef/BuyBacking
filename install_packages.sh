#!/bin/bash

# Install packages in BuyBacking
npm install autoprefixer@10.4.21 axios@1.11.0 cors@2.8.5 express@5.1.0 postcss@8.5.6 shipengine@1.0.7 tailwindcss@3.4.17

# Install packages in secondhandcell-backend
cd secondhandcell-backend || exit 1
npm install autoprefixer@10.4.21 axios@1.11.0 bcrypt@6.0.0 body-parser@2.2.0 cors@2.8.5 dotenv@17.2.1 express@5.1.0 firebase-admin@13.4.0 firebase@12.1.0 jsonwebtoken@9.0.2 node-fetch@3.3.2 postcss@8.5.6 shipengine@1.0.7 tailwindcss@3.4.17

# Install packages in functions
cd ../functions || exit 1
npm install @sendgrid/mail@8.1.5 axios@1.11.0 cors@2.8.5 express@4.21.2 firebase-admin@12.7.0 firebase-functions@4.9.0 nodemailer@7.0.5
