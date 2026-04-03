const fs = require('fs');
const path = require('path');

const csvFilePath = '/home/vighnesh/Work/Samadhanam_HACKATHON26/Samadhanam/serverside/CIVIC-ISSUE-MANAGEMENT/Municipal/backend/your_file.csv';
const stateOutputPath = path.join(__dirname, '../credentials/state_credentials.json');
const municipalOutputPath = path.join(__dirname, '../credentials/municipal_credentials.json');

function generateCredentials() {
    console.log('📁 Reading CSV file...');
    
    const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
    const lines = csvContent.trim().split('\n');
    
    const states = new Map();
    const municipalities = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = line.split(',');
        if (parts.length < 4) continue;
        
        const stateCode = parseInt(parts[0]) || 0;
        const stateName = parts[1]?.trim() || '';
        const districtCode = parseInt(parts[2]) || 0;
        const districtName = parts[3]?.trim() || '';
        
        if (!stateName || !districtName) continue;
        
        const stateUsername = `state_${stateName.toLowerCase().replace(/\s+/g, '_')}`;
        const statePassword = `${stateName.toLowerCase().replace(/\s+/g, '')}@123`;
        
        if (!states.has(stateCode)) {
            states.set(stateCode, {
                state_id: stateCode,
                state_name: stateName,
                username: stateUsername,
                password: statePassword
            });
        }
        
        const municipalUsername = districtName;
        const municipalPassword = `${districtName}@${districtCode}`;
        
        municipalities.push({
            district_id: districtCode,
            district_name: districtName,
            state_id: stateCode,
            state_name: stateName,
            username: municipalUsername,
            password: municipalPassword
        });
    }
    
    const stateCredentials = Array.from(states.values());
    
    console.log(`✅ Found ${stateCredentials.length} states`);
    console.log(`✅ Found ${municipalities.length} districts`);
    
    fs.writeFileSync(stateOutputPath, JSON.stringify(stateCredentials, null, 2));
    console.log(`📄 State credentials saved to: ${stateOutputPath}`);
    
    fs.writeFileSync(municipalOutputPath, JSON.stringify(municipalities, null, 2));
    console.log(`📄 Municipal credentials saved to: ${municipalOutputPath}`);
    
    console.log('\n🎉 Credential generation complete!');
    
    console.log('\n📊 SAMPLE OUTPUT:');
    console.log('--- States (first 3) ---');
    console.log(JSON.stringify(stateCredentials.slice(0, 3), null, 2));
    
    console.log('\n--- Municipalities (first 3) ---');
    console.log(JSON.stringify(municipalities.slice(0, 3), null, 2));
}

generateCredentials();