-- Maintenance normalization commands only.
-- Do not commit real phone numbers, emails, names, or exported production rows here.

UPDATE leads SET pais = 'US'
WHERE LOWER(pais) IN ('us', 'usa', 'united states', 'eua', 'estados', 'estados unidos');

UPDATE leads SET pais = 'BR'
WHERE LOWER(pais) IN ('br', 'brasil', 'brazil');

UPDATE leads SET pais = 'PT'
WHERE LOWER(pais) IN ('pt', 'portugal');

UPDATE leads SET pais = 'CA'
WHERE LOWER(pais) IN ('ca', 'canada', 'canatá', 'canadá');

UPDATE leads SET pais = 'Não Informado'
WHERE pais IS NULL OR LOWER(pais) IN ('null', 'não informado', '');

UPDATE leads SET batizado = 'Não'
WHERE batizado IS NULL OR LOWER(batizado) IN ('null', 'não informado', 'não', 'no', '');

UPDATE leads SET batizado = 'Sim, Evangélico'
WHERE batizado ILIKE '%evangélico%' OR batizado ILIKE '%christian%';

UPDATE leads SET batizado = 'Sim, Católico'
WHERE batizado ILIKE '%católico%' OR batizado ILIKE '%catholic%';

UPDATE leads SET batizado = 'Quero me Batizar'
WHERE batizado ILIKE '%quero me batizar%';

UPDATE leads SET gc_status = 'Não'
WHERE gc_status IS NULL OR LOWER(gc_status) IN ('null', 'não informado', 'não', 'no', '');

UPDATE leads SET gc_status = 'Quero participar'
WHERE gc_status ILIKE '%quero participar%';

UPDATE leads SET gc_status = 'Sim'
WHERE gc_status ILIKE '%sim%' OR gc_status ILIKE '%yes%';

UPDATE leads SET type = 'visitor'
WHERE type IS NULL;
