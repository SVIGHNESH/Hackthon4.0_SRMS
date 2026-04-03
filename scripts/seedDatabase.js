const path = require('path');
require('dotenv').config({ path: '/home/vighnesh/Work/Samadhanam_HACKATHON26/unified-civic-backend/.env' });
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const fs = require('fs');

const stateCredentialsPath = path.join(__dirname, '../credentials/state_credentials.json');
const municipalCredentialsPath = path.join(__dirname, '../credentials/municipal_credentials.json');

const State = require('../models/State');
const Municipal = require('../models/Municipal');
const Operator = require('../models/Operator');

async function seedDatabase() {
    try {
        const mongoUrl = 'mongodb+srv://sam:dham@hack.iqriqc5.mongodb.net/sama?appName=hack';
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(`${mongoUrl}/civic`);
        console.log('✅ Connected to MongoDB');
        
        console.log('\n📖 Reading credential files...');
        const stateCredentials = JSON.parse(fs.readFileSync(stateCredentialsPath, 'utf-8'));
        const municipalCredentials = JSON.parse(fs.readFileSync(municipalCredentialsPath, 'utf-8'));
        
        console.log(`📊 States to seed: ${stateCredentials.length}`);
        console.log(`📊 Municipalities to seed: ${municipalCredentials.length}`);
        
        const saltRounds = 10;
        
        console.log('\n🔐 Hashing passwords and preparing records...');
        
        const stateRecords = await Promise.all(stateCredentials.map(async (cred) => ({
            state_id: cred.state_id,
            state_name: cred.state_name,
            official_username: cred.username,
            hashed_password: await bcrypt.hash(cred.password, saltRounds),
            complaints: [],
            solved: 0,
            pending: 0
        })));
        
        const municipalRecords = await Promise.all(municipalCredentials.map(async (cred) => ({
            district_id: cred.district_id,
            district_name: cred.district_name,
            state_id: cred.state_id,
            state_name: cred.state_name,
            official_username: cred.username,
            hashed_password: await bcrypt.hash(cred.password, saltRounds),
            complaints: [],
            solved: 0,
            demerits: 0,
            pending: 0
        })));
        
        const operatorRecords = await Promise.all(municipalCredentials.map(async (cred, index) => ({
            official_username: `operator_${cred.district_name.toLowerCase().replace(/\s+/g, '_')}_${cred.state_id}`,
            hashed_password: await bcrypt.hash(cred.password, saltRounds),
            district_name: cred.district_name
        })));
        
        console.log('\n🗑️ Clearing existing data...');
        await State.deleteMany({});
        await Municipal.deleteMany({});
        await Operator.deleteMany({});
        console.log('✅ Existing data cleared');
        
        console.log('\n📥 Inserting into State collection...');
        const stateResult = await State.insertMany(stateRecords);
        console.log(`✅ Inserted ${stateResult.length} states`);
        
        console.log('\n📥 Inserting into Municipal collection...');
        const municipalResult = await Municipal.insertMany(municipalRecords);
        console.log(`✅ Inserted ${municipalResult.length} municipalities`);
        
        console.log('\n📥 Creating Operator records...');
        const operatorRecordsWithIds = operatorRecords.map((op, index) => ({
            ...op,
            municipality_id: municipalResult[index]._id
        }));
        const operatorResult = await Operator.insertMany(operatorRecordsWithIds);
        console.log(`✅ Inserted ${operatorResult.length} operators`);
        
        console.log('\n🎉 Database seeding complete!');
        
        console.log('\n📋 SAMPLE LOGIN CREDENTIALS:');
        console.log('─'.repeat(50));
        console.log('STATE LOGIN:');
        console.log(`  Username: ${stateCredentials[0].username}`);
        console.log(`  Password: ${stateCredentials[0].password}`);
        console.log('─'.repeat(50));
        console.log('MUNICIPAL LOGIN:');
        console.log(`  Username: ${municipalCredentials[0].username}`);
        console.log(`  Password: ${municipalCredentials[0].password}`);
        console.log('─'.repeat(50));
        console.log('OPERATOR LOGIN:');
        console.log(`  Username: operator_${municipalCredentials[0].district_name.toLowerCase().replace(/\s+/g, '_')}`);
        console.log(`  Password: ${municipalCredentials[0].password}`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }
}

seedDatabase();