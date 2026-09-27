import React, { useState, useEffect } from 'react';

interface Country {
  name: string;
  code: string;
}

const CountrySelector: React.FC = () => {
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load countries data from JSON file
    fetch('/data/countries.json')
      .then(response => response.json())
      .then((data: Country[]) => {
        setCountries(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error loading countries:', error);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div>Loading countries...</div>;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>Select Country</h2>
      <select
        value={selectedCountry ? selectedCountry.code : ''}
        onChange={(e) => {
          const code = e.target.value;
          const country = countries.find(c => c.code === code) || null;
          setSelectedCountry(country);
        }}
        style={{ padding: '8px', fontSize: '16px' }}
      >
        <option value="">-- Select a country --</option>
        {countries.map(country => (
          <option key={country.code} value={country.code}>
            {country.name}
          </option>
        ))}
      </select>
      {selectedCountry && (
        <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
          <h3>Selected: {selectedCountry.name} ({selectedCountry.code})</h3>
        </div>
      )}
    </div>
  );
};

export default CountrySelector;