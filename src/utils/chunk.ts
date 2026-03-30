/**
 * Divide un array en chunks de tamaño especificado.
 * @param array - Array a dividir
 * @param size - Tamaño de cada chunk
 */
export function chunk<T>(array: readonly T[], size: number): T[][] {
    if (size <= 0) throw new RangeError('El tamaño del chunk debe ser mayor a 0');
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}
