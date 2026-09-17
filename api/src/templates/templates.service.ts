import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Template } from './template.types.js';
import { OPERATORS } from './template.types.js';

/**
 * Loads certified templates from disk.
 *
 * Templates are read once at startup and held in memory. They are certification
 * artefacts, not user data — a board issues one and it does not change until
 * re-certification, at which point the file is replaced and the service
 * restarted. No database, deliberately.
 */
@Injectable()
export class TemplatesService implements OnModuleInit {
  private readonly logger = new Logger(TemplatesService.name);
  private readonly templates = new Map<string, Template>();

  private readonly directory =
    process.env.TEMPLATES_DIR ?? join(process.cwd(), 'src', 'templates');

  onModuleInit(): void {
    this.load();
  }

  private load(): void {
    if (!existsSync(this.directory)) {
      this.logger.warn(`No templates directory at ${this.directory}`);
      return;
    }

    const files = readdirSync(this.directory).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      try {
        const raw = readFileSync(join(this.directory, file), 'utf8');
        const template = this.parse(JSON.parse(raw) as unknown, file);
        this.templates.set(template.template_id, template);
      } catch (error) {
        // A malformed template must not take the service down, but it must
        // be loud — a silently missing template would mean assets screened
        // against nothing.
        this.logger.error(
          `Failed to load template ${file}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Loaded ${this.templates.size} template(s) from ${this.directory}`,
    );
  }

  /**
   * Structural validation only. This checks the template is well-formed —
   * it does not and cannot check whether the conditions are correct. That is
   * the certifying board's judgement, not this service's.
   */
  private parse(raw: unknown, file: string): Template {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('template is not an object');
    }

    const t = raw as Record<string, unknown>;

    for (const key of ['template_id', 'version', 'name', 'structure']) {
      if (typeof t[key] !== 'string') {
        throw new Error(`missing or invalid '${key}'`);
      }
    }

    const cert = t.certification as Record<string, unknown> | undefined;
    if (!cert) throw new Error('missing certification block');
    for (const key of ['certified_by', 'certified_at', 'expires_at']) {
      if (typeof cert[key] !== 'string') {
        throw new Error(`missing or invalid 'certification.${key}'`);
      }
    }

    if (!Array.isArray(t.conditions)) {
      throw new Error('conditions must be an array');
    }

    const seen = new Set<string>();
    for (const [index, condition] of t.conditions.entries()) {
      const c = condition as Record<string, unknown>;

      for (const key of ['id', 'field', 'op', 'description']) {
        if (typeof c[key] !== 'string') {
          throw new Error(`condition ${index}: missing or invalid '${key}'`);
        }
      }

      if (!OPERATORS.includes(c.op as never)) {
        throw new Error(
          `condition '${String(c.id)}': unknown operator '${String(c.op)}'`,
        );
      }

      if (seen.has(c.id as string)) {
        throw new Error(`duplicate condition id '${String(c.id)}'`);
      }
      seen.add(c.id as string);
    }

    this.logger.debug(`Template ${file} parsed with ${t.conditions.length} conditions`);
    return raw as Template;
  }

  findAll(): Template[] {
    return [...this.templates.values()];
  }

  findOne(templateId: string): Template {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new NotFoundException(`No template with id '${templateId}'`);
    }
    return template;
  }

  exists(templateId: string): boolean {
    return this.templates.has(templateId);
  }
}
