// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'game_store_io.dart';

// ignore_for_file: type=lint
class $SavedGamesTable extends SavedGames
    with TableInfo<$SavedGamesTable, SavedGameRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SavedGamesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _gameTypeMeta = const VerificationMeta(
    'gameType',
  );
  @override
  late final GeneratedColumn<String> gameType = GeneratedColumn<String>(
    'game_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _themeMeta = const VerificationMeta('theme');
  @override
  late final GeneratedColumn<String> theme = GeneratedColumn<String>(
    'theme',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _subjectMeta = const VerificationMeta(
    'subject',
  );
  @override
  late final GeneratedColumn<String> subject = GeneratedColumn<String>(
    'subject',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _topicMeta = const VerificationMeta('topic');
  @override
  late final GeneratedColumn<String> topic = GeneratedColumn<String>(
    'topic',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _languageMeta = const VerificationMeta(
    'language',
  );
  @override
  late final GeneratedColumn<String> language = GeneratedColumn<String>(
    'language',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _specJsonMeta = const VerificationMeta(
    'specJson',
  );
  @override
  late final GeneratedColumn<String> specJson = GeneratedColumn<String>(
    'spec_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _thumbnailUrlMeta = const VerificationMeta(
    'thumbnailUrl',
  );
  @override
  late final GeneratedColumn<String> thumbnailUrl = GeneratedColumn<String>(
    'thumbnail_url',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _bestScoreMeta = const VerificationMeta(
    'bestScore',
  );
  @override
  late final GeneratedColumn<int> bestScore = GeneratedColumn<int>(
    'best_score',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _playCountMeta = const VerificationMeta(
    'playCount',
  );
  @override
  late final GeneratedColumn<int> playCount = GeneratedColumn<int>(
    'play_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _lastPlayedAtMeta = const VerificationMeta(
    'lastPlayedAt',
  );
  @override
  late final GeneratedColumn<int> lastPlayedAt = GeneratedColumn<int>(
    'last_played_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _savedAtMeta = const VerificationMeta(
    'savedAt',
  );
  @override
  late final GeneratedColumn<int> savedAt = GeneratedColumn<int>(
    'saved_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _pendingSummaryJsonMeta =
      const VerificationMeta('pendingSummaryJson');
  @override
  late final GeneratedColumn<String> pendingSummaryJson =
      GeneratedColumn<String>(
        'pending_summary_json',
        aliasedName,
        true,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
      );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    gameType,
    theme,
    subject,
    topic,
    language,
    specJson,
    thumbnailUrl,
    bestScore,
    playCount,
    lastPlayedAt,
    savedAt,
    pendingSummaryJson,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'saved_games';
  @override
  VerificationContext validateIntegrity(
    Insertable<SavedGameRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('game_type')) {
      context.handle(
        _gameTypeMeta,
        gameType.isAcceptableOrUnknown(data['game_type']!, _gameTypeMeta),
      );
    } else if (isInserting) {
      context.missing(_gameTypeMeta);
    }
    if (data.containsKey('theme')) {
      context.handle(
        _themeMeta,
        theme.isAcceptableOrUnknown(data['theme']!, _themeMeta),
      );
    } else if (isInserting) {
      context.missing(_themeMeta);
    }
    if (data.containsKey('subject')) {
      context.handle(
        _subjectMeta,
        subject.isAcceptableOrUnknown(data['subject']!, _subjectMeta),
      );
    } else if (isInserting) {
      context.missing(_subjectMeta);
    }
    if (data.containsKey('topic')) {
      context.handle(
        _topicMeta,
        topic.isAcceptableOrUnknown(data['topic']!, _topicMeta),
      );
    } else if (isInserting) {
      context.missing(_topicMeta);
    }
    if (data.containsKey('language')) {
      context.handle(
        _languageMeta,
        language.isAcceptableOrUnknown(data['language']!, _languageMeta),
      );
    } else if (isInserting) {
      context.missing(_languageMeta);
    }
    if (data.containsKey('spec_json')) {
      context.handle(
        _specJsonMeta,
        specJson.isAcceptableOrUnknown(data['spec_json']!, _specJsonMeta),
      );
    } else if (isInserting) {
      context.missing(_specJsonMeta);
    }
    if (data.containsKey('thumbnail_url')) {
      context.handle(
        _thumbnailUrlMeta,
        thumbnailUrl.isAcceptableOrUnknown(
          data['thumbnail_url']!,
          _thumbnailUrlMeta,
        ),
      );
    }
    if (data.containsKey('best_score')) {
      context.handle(
        _bestScoreMeta,
        bestScore.isAcceptableOrUnknown(data['best_score']!, _bestScoreMeta),
      );
    }
    if (data.containsKey('play_count')) {
      context.handle(
        _playCountMeta,
        playCount.isAcceptableOrUnknown(data['play_count']!, _playCountMeta),
      );
    }
    if (data.containsKey('last_played_at')) {
      context.handle(
        _lastPlayedAtMeta,
        lastPlayedAt.isAcceptableOrUnknown(
          data['last_played_at']!,
          _lastPlayedAtMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_lastPlayedAtMeta);
    }
    if (data.containsKey('saved_at')) {
      context.handle(
        _savedAtMeta,
        savedAt.isAcceptableOrUnknown(data['saved_at']!, _savedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_savedAtMeta);
    }
    if (data.containsKey('pending_summary_json')) {
      context.handle(
        _pendingSummaryJsonMeta,
        pendingSummaryJson.isAcceptableOrUnknown(
          data['pending_summary_json']!,
          _pendingSummaryJsonMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  SavedGameRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SavedGameRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      gameType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}game_type'],
      )!,
      theme: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}theme'],
      )!,
      subject: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}subject'],
      )!,
      topic: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}topic'],
      )!,
      language: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}language'],
      )!,
      specJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}spec_json'],
      )!,
      thumbnailUrl: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}thumbnail_url'],
      ),
      bestScore: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}best_score'],
      )!,
      playCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}play_count'],
      )!,
      lastPlayedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}last_played_at'],
      )!,
      savedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}saved_at'],
      )!,
      pendingSummaryJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}pending_summary_json'],
      ),
    );
  }

  @override
  $SavedGamesTable createAlias(String alias) {
    return $SavedGamesTable(attachedDatabase, alias);
  }
}

class SavedGameRow extends DataClass implements Insertable<SavedGameRow> {
  final String id;
  final String gameType;
  final String theme;
  final String subject;
  final String topic;
  final String language;
  final String specJson;
  final String? thumbnailUrl;
  final int bestScore;
  final int playCount;
  final int lastPlayedAt;
  final int savedAt;
  final String? pendingSummaryJson;
  const SavedGameRow({
    required this.id,
    required this.gameType,
    required this.theme,
    required this.subject,
    required this.topic,
    required this.language,
    required this.specJson,
    this.thumbnailUrl,
    required this.bestScore,
    required this.playCount,
    required this.lastPlayedAt,
    required this.savedAt,
    this.pendingSummaryJson,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['game_type'] = Variable<String>(gameType);
    map['theme'] = Variable<String>(theme);
    map['subject'] = Variable<String>(subject);
    map['topic'] = Variable<String>(topic);
    map['language'] = Variable<String>(language);
    map['spec_json'] = Variable<String>(specJson);
    if (!nullToAbsent || thumbnailUrl != null) {
      map['thumbnail_url'] = Variable<String>(thumbnailUrl);
    }
    map['best_score'] = Variable<int>(bestScore);
    map['play_count'] = Variable<int>(playCount);
    map['last_played_at'] = Variable<int>(lastPlayedAt);
    map['saved_at'] = Variable<int>(savedAt);
    if (!nullToAbsent || pendingSummaryJson != null) {
      map['pending_summary_json'] = Variable<String>(pendingSummaryJson);
    }
    return map;
  }

  SavedGamesCompanion toCompanion(bool nullToAbsent) {
    return SavedGamesCompanion(
      id: Value(id),
      gameType: Value(gameType),
      theme: Value(theme),
      subject: Value(subject),
      topic: Value(topic),
      language: Value(language),
      specJson: Value(specJson),
      thumbnailUrl: thumbnailUrl == null && nullToAbsent
          ? const Value.absent()
          : Value(thumbnailUrl),
      bestScore: Value(bestScore),
      playCount: Value(playCount),
      lastPlayedAt: Value(lastPlayedAt),
      savedAt: Value(savedAt),
      pendingSummaryJson: pendingSummaryJson == null && nullToAbsent
          ? const Value.absent()
          : Value(pendingSummaryJson),
    );
  }

  factory SavedGameRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SavedGameRow(
      id: serializer.fromJson<String>(json['id']),
      gameType: serializer.fromJson<String>(json['gameType']),
      theme: serializer.fromJson<String>(json['theme']),
      subject: serializer.fromJson<String>(json['subject']),
      topic: serializer.fromJson<String>(json['topic']),
      language: serializer.fromJson<String>(json['language']),
      specJson: serializer.fromJson<String>(json['specJson']),
      thumbnailUrl: serializer.fromJson<String?>(json['thumbnailUrl']),
      bestScore: serializer.fromJson<int>(json['bestScore']),
      playCount: serializer.fromJson<int>(json['playCount']),
      lastPlayedAt: serializer.fromJson<int>(json['lastPlayedAt']),
      savedAt: serializer.fromJson<int>(json['savedAt']),
      pendingSummaryJson: serializer.fromJson<String?>(
        json['pendingSummaryJson'],
      ),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'gameType': serializer.toJson<String>(gameType),
      'theme': serializer.toJson<String>(theme),
      'subject': serializer.toJson<String>(subject),
      'topic': serializer.toJson<String>(topic),
      'language': serializer.toJson<String>(language),
      'specJson': serializer.toJson<String>(specJson),
      'thumbnailUrl': serializer.toJson<String?>(thumbnailUrl),
      'bestScore': serializer.toJson<int>(bestScore),
      'playCount': serializer.toJson<int>(playCount),
      'lastPlayedAt': serializer.toJson<int>(lastPlayedAt),
      'savedAt': serializer.toJson<int>(savedAt),
      'pendingSummaryJson': serializer.toJson<String?>(pendingSummaryJson),
    };
  }

  SavedGameRow copyWith({
    String? id,
    String? gameType,
    String? theme,
    String? subject,
    String? topic,
    String? language,
    String? specJson,
    Value<String?> thumbnailUrl = const Value.absent(),
    int? bestScore,
    int? playCount,
    int? lastPlayedAt,
    int? savedAt,
    Value<String?> pendingSummaryJson = const Value.absent(),
  }) => SavedGameRow(
    id: id ?? this.id,
    gameType: gameType ?? this.gameType,
    theme: theme ?? this.theme,
    subject: subject ?? this.subject,
    topic: topic ?? this.topic,
    language: language ?? this.language,
    specJson: specJson ?? this.specJson,
    thumbnailUrl: thumbnailUrl.present ? thumbnailUrl.value : this.thumbnailUrl,
    bestScore: bestScore ?? this.bestScore,
    playCount: playCount ?? this.playCount,
    lastPlayedAt: lastPlayedAt ?? this.lastPlayedAt,
    savedAt: savedAt ?? this.savedAt,
    pendingSummaryJson: pendingSummaryJson.present
        ? pendingSummaryJson.value
        : this.pendingSummaryJson,
  );
  SavedGameRow copyWithCompanion(SavedGamesCompanion data) {
    return SavedGameRow(
      id: data.id.present ? data.id.value : this.id,
      gameType: data.gameType.present ? data.gameType.value : this.gameType,
      theme: data.theme.present ? data.theme.value : this.theme,
      subject: data.subject.present ? data.subject.value : this.subject,
      topic: data.topic.present ? data.topic.value : this.topic,
      language: data.language.present ? data.language.value : this.language,
      specJson: data.specJson.present ? data.specJson.value : this.specJson,
      thumbnailUrl: data.thumbnailUrl.present
          ? data.thumbnailUrl.value
          : this.thumbnailUrl,
      bestScore: data.bestScore.present ? data.bestScore.value : this.bestScore,
      playCount: data.playCount.present ? data.playCount.value : this.playCount,
      lastPlayedAt: data.lastPlayedAt.present
          ? data.lastPlayedAt.value
          : this.lastPlayedAt,
      savedAt: data.savedAt.present ? data.savedAt.value : this.savedAt,
      pendingSummaryJson: data.pendingSummaryJson.present
          ? data.pendingSummaryJson.value
          : this.pendingSummaryJson,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SavedGameRow(')
          ..write('id: $id, ')
          ..write('gameType: $gameType, ')
          ..write('theme: $theme, ')
          ..write('subject: $subject, ')
          ..write('topic: $topic, ')
          ..write('language: $language, ')
          ..write('specJson: $specJson, ')
          ..write('thumbnailUrl: $thumbnailUrl, ')
          ..write('bestScore: $bestScore, ')
          ..write('playCount: $playCount, ')
          ..write('lastPlayedAt: $lastPlayedAt, ')
          ..write('savedAt: $savedAt, ')
          ..write('pendingSummaryJson: $pendingSummaryJson')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    gameType,
    theme,
    subject,
    topic,
    language,
    specJson,
    thumbnailUrl,
    bestScore,
    playCount,
    lastPlayedAt,
    savedAt,
    pendingSummaryJson,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SavedGameRow &&
          other.id == this.id &&
          other.gameType == this.gameType &&
          other.theme == this.theme &&
          other.subject == this.subject &&
          other.topic == this.topic &&
          other.language == this.language &&
          other.specJson == this.specJson &&
          other.thumbnailUrl == this.thumbnailUrl &&
          other.bestScore == this.bestScore &&
          other.playCount == this.playCount &&
          other.lastPlayedAt == this.lastPlayedAt &&
          other.savedAt == this.savedAt &&
          other.pendingSummaryJson == this.pendingSummaryJson);
}

class SavedGamesCompanion extends UpdateCompanion<SavedGameRow> {
  final Value<String> id;
  final Value<String> gameType;
  final Value<String> theme;
  final Value<String> subject;
  final Value<String> topic;
  final Value<String> language;
  final Value<String> specJson;
  final Value<String?> thumbnailUrl;
  final Value<int> bestScore;
  final Value<int> playCount;
  final Value<int> lastPlayedAt;
  final Value<int> savedAt;
  final Value<String?> pendingSummaryJson;
  final Value<int> rowid;
  const SavedGamesCompanion({
    this.id = const Value.absent(),
    this.gameType = const Value.absent(),
    this.theme = const Value.absent(),
    this.subject = const Value.absent(),
    this.topic = const Value.absent(),
    this.language = const Value.absent(),
    this.specJson = const Value.absent(),
    this.thumbnailUrl = const Value.absent(),
    this.bestScore = const Value.absent(),
    this.playCount = const Value.absent(),
    this.lastPlayedAt = const Value.absent(),
    this.savedAt = const Value.absent(),
    this.pendingSummaryJson = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SavedGamesCompanion.insert({
    required String id,
    required String gameType,
    required String theme,
    required String subject,
    required String topic,
    required String language,
    required String specJson,
    this.thumbnailUrl = const Value.absent(),
    this.bestScore = const Value.absent(),
    this.playCount = const Value.absent(),
    required int lastPlayedAt,
    required int savedAt,
    this.pendingSummaryJson = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       gameType = Value(gameType),
       theme = Value(theme),
       subject = Value(subject),
       topic = Value(topic),
       language = Value(language),
       specJson = Value(specJson),
       lastPlayedAt = Value(lastPlayedAt),
       savedAt = Value(savedAt);
  static Insertable<SavedGameRow> custom({
    Expression<String>? id,
    Expression<String>? gameType,
    Expression<String>? theme,
    Expression<String>? subject,
    Expression<String>? topic,
    Expression<String>? language,
    Expression<String>? specJson,
    Expression<String>? thumbnailUrl,
    Expression<int>? bestScore,
    Expression<int>? playCount,
    Expression<int>? lastPlayedAt,
    Expression<int>? savedAt,
    Expression<String>? pendingSummaryJson,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (gameType != null) 'game_type': gameType,
      if (theme != null) 'theme': theme,
      if (subject != null) 'subject': subject,
      if (topic != null) 'topic': topic,
      if (language != null) 'language': language,
      if (specJson != null) 'spec_json': specJson,
      if (thumbnailUrl != null) 'thumbnail_url': thumbnailUrl,
      if (bestScore != null) 'best_score': bestScore,
      if (playCount != null) 'play_count': playCount,
      if (lastPlayedAt != null) 'last_played_at': lastPlayedAt,
      if (savedAt != null) 'saved_at': savedAt,
      if (pendingSummaryJson != null)
        'pending_summary_json': pendingSummaryJson,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SavedGamesCompanion copyWith({
    Value<String>? id,
    Value<String>? gameType,
    Value<String>? theme,
    Value<String>? subject,
    Value<String>? topic,
    Value<String>? language,
    Value<String>? specJson,
    Value<String?>? thumbnailUrl,
    Value<int>? bestScore,
    Value<int>? playCount,
    Value<int>? lastPlayedAt,
    Value<int>? savedAt,
    Value<String?>? pendingSummaryJson,
    Value<int>? rowid,
  }) {
    return SavedGamesCompanion(
      id: id ?? this.id,
      gameType: gameType ?? this.gameType,
      theme: theme ?? this.theme,
      subject: subject ?? this.subject,
      topic: topic ?? this.topic,
      language: language ?? this.language,
      specJson: specJson ?? this.specJson,
      thumbnailUrl: thumbnailUrl ?? this.thumbnailUrl,
      bestScore: bestScore ?? this.bestScore,
      playCount: playCount ?? this.playCount,
      lastPlayedAt: lastPlayedAt ?? this.lastPlayedAt,
      savedAt: savedAt ?? this.savedAt,
      pendingSummaryJson: pendingSummaryJson ?? this.pendingSummaryJson,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (gameType.present) {
      map['game_type'] = Variable<String>(gameType.value);
    }
    if (theme.present) {
      map['theme'] = Variable<String>(theme.value);
    }
    if (subject.present) {
      map['subject'] = Variable<String>(subject.value);
    }
    if (topic.present) {
      map['topic'] = Variable<String>(topic.value);
    }
    if (language.present) {
      map['language'] = Variable<String>(language.value);
    }
    if (specJson.present) {
      map['spec_json'] = Variable<String>(specJson.value);
    }
    if (thumbnailUrl.present) {
      map['thumbnail_url'] = Variable<String>(thumbnailUrl.value);
    }
    if (bestScore.present) {
      map['best_score'] = Variable<int>(bestScore.value);
    }
    if (playCount.present) {
      map['play_count'] = Variable<int>(playCount.value);
    }
    if (lastPlayedAt.present) {
      map['last_played_at'] = Variable<int>(lastPlayedAt.value);
    }
    if (savedAt.present) {
      map['saved_at'] = Variable<int>(savedAt.value);
    }
    if (pendingSummaryJson.present) {
      map['pending_summary_json'] = Variable<String>(pendingSummaryJson.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SavedGamesCompanion(')
          ..write('id: $id, ')
          ..write('gameType: $gameType, ')
          ..write('theme: $theme, ')
          ..write('subject: $subject, ')
          ..write('topic: $topic, ')
          ..write('language: $language, ')
          ..write('specJson: $specJson, ')
          ..write('thumbnailUrl: $thumbnailUrl, ')
          ..write('bestScore: $bestScore, ')
          ..write('playCount: $playCount, ')
          ..write('lastPlayedAt: $lastPlayedAt, ')
          ..write('savedAt: $savedAt, ')
          ..write('pendingSummaryJson: $pendingSummaryJson, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$EduMindDb extends GeneratedDatabase {
  _$EduMindDb(QueryExecutor e) : super(e);
  $EduMindDbManager get managers => $EduMindDbManager(this);
  late final $SavedGamesTable savedGames = $SavedGamesTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [savedGames];
}

typedef $$SavedGamesTableCreateCompanionBuilder =
    SavedGamesCompanion Function({
      required String id,
      required String gameType,
      required String theme,
      required String subject,
      required String topic,
      required String language,
      required String specJson,
      Value<String?> thumbnailUrl,
      Value<int> bestScore,
      Value<int> playCount,
      required int lastPlayedAt,
      required int savedAt,
      Value<String?> pendingSummaryJson,
      Value<int> rowid,
    });
typedef $$SavedGamesTableUpdateCompanionBuilder =
    SavedGamesCompanion Function({
      Value<String> id,
      Value<String> gameType,
      Value<String> theme,
      Value<String> subject,
      Value<String> topic,
      Value<String> language,
      Value<String> specJson,
      Value<String?> thumbnailUrl,
      Value<int> bestScore,
      Value<int> playCount,
      Value<int> lastPlayedAt,
      Value<int> savedAt,
      Value<String?> pendingSummaryJson,
      Value<int> rowid,
    });

class $$SavedGamesTableFilterComposer
    extends Composer<_$EduMindDb, $SavedGamesTable> {
  $$SavedGamesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get gameType => $composableBuilder(
    column: $table.gameType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get theme => $composableBuilder(
    column: $table.theme,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get subject => $composableBuilder(
    column: $table.subject,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get topic => $composableBuilder(
    column: $table.topic,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get language => $composableBuilder(
    column: $table.language,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get specJson => $composableBuilder(
    column: $table.specJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get thumbnailUrl => $composableBuilder(
    column: $table.thumbnailUrl,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get bestScore => $composableBuilder(
    column: $table.bestScore,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get playCount => $composableBuilder(
    column: $table.playCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get lastPlayedAt => $composableBuilder(
    column: $table.lastPlayedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get savedAt => $composableBuilder(
    column: $table.savedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get pendingSummaryJson => $composableBuilder(
    column: $table.pendingSummaryJson,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SavedGamesTableOrderingComposer
    extends Composer<_$EduMindDb, $SavedGamesTable> {
  $$SavedGamesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get gameType => $composableBuilder(
    column: $table.gameType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get theme => $composableBuilder(
    column: $table.theme,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get subject => $composableBuilder(
    column: $table.subject,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get topic => $composableBuilder(
    column: $table.topic,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get language => $composableBuilder(
    column: $table.language,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get specJson => $composableBuilder(
    column: $table.specJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get thumbnailUrl => $composableBuilder(
    column: $table.thumbnailUrl,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get bestScore => $composableBuilder(
    column: $table.bestScore,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get playCount => $composableBuilder(
    column: $table.playCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get lastPlayedAt => $composableBuilder(
    column: $table.lastPlayedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get savedAt => $composableBuilder(
    column: $table.savedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get pendingSummaryJson => $composableBuilder(
    column: $table.pendingSummaryJson,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SavedGamesTableAnnotationComposer
    extends Composer<_$EduMindDb, $SavedGamesTable> {
  $$SavedGamesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get gameType =>
      $composableBuilder(column: $table.gameType, builder: (column) => column);

  GeneratedColumn<String> get theme =>
      $composableBuilder(column: $table.theme, builder: (column) => column);

  GeneratedColumn<String> get subject =>
      $composableBuilder(column: $table.subject, builder: (column) => column);

  GeneratedColumn<String> get topic =>
      $composableBuilder(column: $table.topic, builder: (column) => column);

  GeneratedColumn<String> get language =>
      $composableBuilder(column: $table.language, builder: (column) => column);

  GeneratedColumn<String> get specJson =>
      $composableBuilder(column: $table.specJson, builder: (column) => column);

  GeneratedColumn<String> get thumbnailUrl => $composableBuilder(
    column: $table.thumbnailUrl,
    builder: (column) => column,
  );

  GeneratedColumn<int> get bestScore =>
      $composableBuilder(column: $table.bestScore, builder: (column) => column);

  GeneratedColumn<int> get playCount =>
      $composableBuilder(column: $table.playCount, builder: (column) => column);

  GeneratedColumn<int> get lastPlayedAt => $composableBuilder(
    column: $table.lastPlayedAt,
    builder: (column) => column,
  );

  GeneratedColumn<int> get savedAt =>
      $composableBuilder(column: $table.savedAt, builder: (column) => column);

  GeneratedColumn<String> get pendingSummaryJson => $composableBuilder(
    column: $table.pendingSummaryJson,
    builder: (column) => column,
  );
}

class $$SavedGamesTableTableManager
    extends
        RootTableManager<
          _$EduMindDb,
          $SavedGamesTable,
          SavedGameRow,
          $$SavedGamesTableFilterComposer,
          $$SavedGamesTableOrderingComposer,
          $$SavedGamesTableAnnotationComposer,
          $$SavedGamesTableCreateCompanionBuilder,
          $$SavedGamesTableUpdateCompanionBuilder,
          (
            SavedGameRow,
            BaseReferences<_$EduMindDb, $SavedGamesTable, SavedGameRow>,
          ),
          SavedGameRow,
          PrefetchHooks Function()
        > {
  $$SavedGamesTableTableManager(_$EduMindDb db, $SavedGamesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SavedGamesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SavedGamesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SavedGamesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> gameType = const Value.absent(),
                Value<String> theme = const Value.absent(),
                Value<String> subject = const Value.absent(),
                Value<String> topic = const Value.absent(),
                Value<String> language = const Value.absent(),
                Value<String> specJson = const Value.absent(),
                Value<String?> thumbnailUrl = const Value.absent(),
                Value<int> bestScore = const Value.absent(),
                Value<int> playCount = const Value.absent(),
                Value<int> lastPlayedAt = const Value.absent(),
                Value<int> savedAt = const Value.absent(),
                Value<String?> pendingSummaryJson = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SavedGamesCompanion(
                id: id,
                gameType: gameType,
                theme: theme,
                subject: subject,
                topic: topic,
                language: language,
                specJson: specJson,
                thumbnailUrl: thumbnailUrl,
                bestScore: bestScore,
                playCount: playCount,
                lastPlayedAt: lastPlayedAt,
                savedAt: savedAt,
                pendingSummaryJson: pendingSummaryJson,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String gameType,
                required String theme,
                required String subject,
                required String topic,
                required String language,
                required String specJson,
                Value<String?> thumbnailUrl = const Value.absent(),
                Value<int> bestScore = const Value.absent(),
                Value<int> playCount = const Value.absent(),
                required int lastPlayedAt,
                required int savedAt,
                Value<String?> pendingSummaryJson = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SavedGamesCompanion.insert(
                id: id,
                gameType: gameType,
                theme: theme,
                subject: subject,
                topic: topic,
                language: language,
                specJson: specJson,
                thumbnailUrl: thumbnailUrl,
                bestScore: bestScore,
                playCount: playCount,
                lastPlayedAt: lastPlayedAt,
                savedAt: savedAt,
                pendingSummaryJson: pendingSummaryJson,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SavedGamesTableProcessedTableManager =
    ProcessedTableManager<
      _$EduMindDb,
      $SavedGamesTable,
      SavedGameRow,
      $$SavedGamesTableFilterComposer,
      $$SavedGamesTableOrderingComposer,
      $$SavedGamesTableAnnotationComposer,
      $$SavedGamesTableCreateCompanionBuilder,
      $$SavedGamesTableUpdateCompanionBuilder,
      (
        SavedGameRow,
        BaseReferences<_$EduMindDb, $SavedGamesTable, SavedGameRow>,
      ),
      SavedGameRow,
      PrefetchHooks Function()
    >;

class $EduMindDbManager {
  final _$EduMindDb _db;
  $EduMindDbManager(this._db);
  $$SavedGamesTableTableManager get savedGames =>
      $$SavedGamesTableTableManager(_db, _db.savedGames);
}
