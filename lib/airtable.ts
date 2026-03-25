const AIRTABLE_TOKEN = process.env.AIRTABLE_API_KEY!;
const BASE_ID = 'appW24NwBfb24b8de';

const TABLES = [
  { id: 'tblarejLPXgcfJwmr', name: 'members', emailField: 'fldxvcyc29tGhrd3x' },
  { id: 'tblhtpKyw6p2QUkle', name: 'staff', emailField: 'fldqbDXyYEgMwZZob' },
] as const;

type AirtableUser = {
  id: string;
  email: string;
  source: 'airtable';
  table: 'members' | 'staff';
};

export async function findUserByEmail(email: string): Promise<AirtableUser | null> {
  for (const table of TABLES) {
    const formula = encodeURIComponent(`LOWER({email})="${email.toLowerCase()}"`);
    const url = `https://api.airtable.com/v0/${BASE_ID}/${table.id}?filterByFormula=${formula}&maxRecords=1`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });

    if (!res.ok) continue;

    const data = await res.json();
    const record = data.records?.[0];
    if (record) {
      return {
        id: record.id,
        email: record.fields.email ?? email,
        source: 'airtable',
        table: table.name,
      };
    }
  }

  return null;
}

export async function findUserById(recordId: string): Promise<AirtableUser | null> {
  for (const table of TABLES) {
    const url = `https://api.airtable.com/v0/${BASE_ID}/${table.id}/${recordId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });

    if (!res.ok) continue;

    const record = await res.json();
    if (record?.id) {
      return {
        id: record.id,
        email: record.fields.email ?? '',
        source: 'airtable',
        table: table.name,
      };
    }
  }

  return null;
}
