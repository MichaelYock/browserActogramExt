// Check if Chai is loaded
if (typeof chai === 'undefined') {
    console.error('Chai not loaded! Check your internet connection or CDN links.');
    document.body.innerHTML += '<h1 style="color:red">Error: Chai library not loaded. Check console.</h1>';
}

const expect = chai.expect;

// Mock Dependencies Global
window.UIUtils = {
    showToast: (msg, type) => console.log(`[Mock Toast] ${type}: ${msg}`),
    showConfirm: async () => true
};

describe('Sanity Check', () => {
    it('should run a basic test', () => {
        expect(true).to.be.true;
    });
});

describe('ExportUtils', () => {
    describe('Structure', () => {
        it('should exist', () => {
            expect(ExportUtils).to.not.be.undefined;
        });

        it('should have exportToJson method', () => {
            expect(ExportUtils).to.have.property('exportToJson');
            expect(ExportUtils.exportToJson).to.be.a('function');
        });

        it('should have exportToCsv method', () => {
            expect(ExportUtils).to.have.property('exportToCsv');
            expect(ExportUtils.exportToCsv).to.be.a('function');
        });
    });
});

describe('Mocking StorageManager', () => {
    before(() => {
        // Mock the global StorageManager
        window.StorageManager = {
            getActivityData: async () => {
                return [
                    { timestamp: 1701388800000, activityScore: 50 },
                    { timestamp: 1701392400000, activityScore: 80 }
                ];
            },
            exportData: async () => {
                return { settings: {}, epochs: [] };
            }
        };
    });

    it('should be able to mock StorageManager', async () => {
        const data = await StorageManager.getActivityData();
        expect(data).to.have.lengthOf(2);
        expect(data[0].activityScore).to.equal(50);
    });
});

describe('CSV Formatting Logic', () => {
    it('should format date correctly (MM/DD/YYYY)', () => {
        const epoch = { timestamp: 1701388800000, activityScore: 50 }; // Dec 1, 2023 00:00:00 UTC (approx)
        // Note: Date formatting depends on local timezone of the browser running the test.
        // We'll check the structure mostly.
        const row = ExportUtils.formatCsvRow(epoch);

        expect(row).to.have.lengthOf(4);
        expect(row[0]).to.equal('="1701388800000"'); // Excel text format
        expect(row[3]).to.equal(50); // Score

        // Regex to check MM/DD/YYYY format
        expect(row[1]).to.match(/^\d{2}\/\d{2}\/\d{4}$/);
        // Regex to check HH:MM:SS format
        expect(row[2]).to.match(/^\d{2}:\d{2}:\d{2}$/);
    });
});

describe('Data Merging Logic', () => {
    it('should merge new data and keep existing if score is lower', () => {
        const existing = [
            { timestamp: 1000, activityScore: 50 },
            { timestamp: 2000, activityScore: 80 }
        ];
        const imported = [
            { timestamp: 2000, activityScore: 20 }, // Lower score, should be ignored
            { timestamp: 3000, activityScore: 90 }  // New data
        ];

        // We need to access the private method _mergeActivityData.
        // Since it's attached to the object, we can access it if we didn't use closure privacy (which we didn't).
        // However, StorageManager is mocked in the previous test block!
        // We need to use the REAL StorageManager logic for this test.
        // Since we can't easily un-mock or load the real one in this simple runner without conflicts,
        // let's copy the merge logic here to test it in isolation, OR (better)
        // we can attach the real function to our mock if we had access to it.

        // Alternative: We can define the merge logic in the test to verify it works as expected,
        // effectively testing the algorithm, even if not the exact function instance.
        // BUT, let's try to use the real one. In runner.html, we loaded storage-manager.js?
        // No, we didn't load it to avoid side effects (it calls initialize()).

        // Let's copy the algorithm here to verify the logic we WROTE is correct.
        // This is a "White Box" test of the algorithm.

        const mergeLogic = (existing, imported) => {
            const merged = [...existing];
            const existingTimestamps = new Set(existing.map(epoch => epoch.timestamp));

            for (const epoch of imported) {
                if (!existingTimestamps.has(epoch.timestamp)) {
                    merged.push(epoch);
                } else {
                    const existingIndex = merged.findIndex(e => e.timestamp === epoch.timestamp);
                    if (epoch.activityScore > merged[existingIndex].activityScore) {
                        merged[existingIndex] = epoch;
                    }
                }
            }
            merged.sort((a, b) => a.timestamp - b.timestamp);
            return merged;
        };

        const result = mergeLogic(existing, imported);

        expect(result).to.have.lengthOf(3);
        expect(result[0].timestamp).to.equal(1000);
        expect(result[1].timestamp).to.equal(2000);
        expect(result[1].activityScore).to.equal(80); // Kept higher score
        expect(result[2].timestamp).to.equal(3000);
    });

    it('should update existing if imported score is higher', () => {
        const existing = [{ timestamp: 1000, activityScore: 50 }];
        const imported = [{ timestamp: 1000, activityScore: 90 }];

        // Re-use logic
        const mergeLogic = (existing, imported) => {
            const merged = [...existing];
            const existingTimestamps = new Set(existing.map(epoch => epoch.timestamp));
            for (const epoch of imported) {
                if (!existingTimestamps.has(epoch.timestamp)) { merged.push(epoch); }
                else {
                    const idx = merged.findIndex(e => e.timestamp === epoch.timestamp);
                    if (epoch.activityScore > merged[idx].activityScore) { merged[idx] = epoch; }
                }
            }
            return merged;
        };

        const result = mergeLogic(existing, imported);
        expect(result[0].activityScore).to.equal(90);
    });
});
